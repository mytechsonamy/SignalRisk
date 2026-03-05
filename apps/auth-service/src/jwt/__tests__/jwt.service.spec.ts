import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { JwtTokenService } from '../jwt.service';
import { KeyManager, ManagedKey } from '../key-manager';

// Silence OpenTelemetry in tests
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startActiveSpan: (_name: string, fn: (span: any) => any) =>
        fn({
          setAttribute: jest.fn(),
          setStatus: jest.fn(),
          end: jest.fn(),
        }),
    }),
  },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

describe('JwtTokenService', () => {
  let service: JwtTokenService;
  let keyManager: KeyManager;
  let testKey: ManagedKey;

  beforeAll(async () => {
    // Generate a real RSA key pair for testing
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });

    testKey = {
      kid: 'test-kid-1',
      privateKey,
      publicKey,
      createdAt: new Date(),
      active: true,
    };
  });

  beforeEach(() => {
    keyManager = {
      getCurrentSigningKey: jest.fn().mockReturnValue(testKey),
      getKeyByKid: jest.fn().mockReturnValue(testKey),
      getAllActivePublicKeys: jest.fn().mockReturnValue([]),
    } as any;

    const configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          JWT_ACCESS_TOKEN_TTL_SECONDS: 900,
          JWT_REFRESH_TOKEN_TTL_SECONDS: 604800,
          JWT_ISSUER: 'signalrisk-auth',
        };
        return config[key] ?? defaultValue;
      }),
    } as any;

    service = new JwtTokenService(keyManager, configService);
  });

  describe('signAccessToken', () => {
    it('should create a valid RS256 JWT with correct claims', async () => {
      const result = await service.signAccessToken({
        userId: 'user-001',
        merchantId: 'merchant-001',
        role: 'ADMIN',
        permissions: ['read', 'write'],
      });

      expect(result.accessToken).toBeDefined();
      expect(result.expiresIn).toBe(900);
      expect(result.jti).toBeDefined();

      // Verify the token is valid RS256
      const decoded = jwt.verify(result.accessToken, testKey.publicKey, {
        algorithms: ['RS256'],
        issuer: 'signalrisk-auth',
      }) as any;

      expect(decoded.sub).toBe('user-001');
      expect(decoded.merchant_id).toBe('merchant-001');
      expect(decoded.role).toBe('ADMIN');
      expect(decoded.permissions).toEqual(['read', 'write']);
      expect(decoded.jti).toBe(result.jti);
      expect(decoded.iss).toBe('signalrisk-auth');
    });

    it('should include kid in the JWT header', async () => {
      const result = await service.signAccessToken({
        userId: 'user-001',
        merchantId: 'merchant-001',
        role: 'ANALYST',
        permissions: [],
      });

      const decoded = jwt.decode(result.accessToken, { complete: true });
      expect(decoded?.header.kid).toBe('test-kid-1');
      expect(decoded?.header.alg).toBe('RS256');
    });

    it('should generate unique jti for each token', async () => {
      const claims = {
        userId: 'user-001',
        merchantId: 'merchant-001',
        role: 'ANALYST',
        permissions: [],
      };

      const result1 = await service.signAccessToken(claims);
      const result2 = await service.signAccessToken(claims);

      expect(result1.jti).not.toBe(result2.jti);
    });

    it('should set correct expiry on the token', async () => {
      const result = await service.signAccessToken({
        userId: 'user-001',
        merchantId: 'merchant-001',
        role: 'ANALYST',
        permissions: [],
      });

      const decoded = jwt.decode(result.accessToken) as any;
      expect(decoded.exp - decoded.iat).toBe(900);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid token and return payload', async () => {
      const { accessToken } = await service.signAccessToken({
        userId: 'user-001',
        merchantId: 'merchant-001',
        role: 'ADMIN',
        permissions: ['read'],
      });

      const payload = await service.verifyAccessToken(accessToken);
      expect(payload.sub).toBe('user-001');
      expect(payload.merchant_id).toBe('merchant-001');
      expect(payload.role).toBe('ADMIN');
    });

    it('should reject an expired token', async () => {
      // Create a token that's already expired
      const token = jwt.sign(
        { sub: 'user-001', merchant_id: 'm-1', role: 'ADMIN', permissions: [], jti: 'test' },
        testKey.privateKey,
        { algorithm: 'RS256', expiresIn: -10, issuer: 'signalrisk-auth', keyid: 'test-kid-1' },
      );

      await expect(service.verifyAccessToken(token)).rejects.toThrow(
        'Token expired',
      );
    });

    it('should reject a token with unknown kid', async () => {
      (keyManager.getKeyByKid as jest.Mock).mockReturnValue(undefined);

      const token = jwt.sign(
        { sub: 'user-001', merchant_id: 'm-1', role: 'ADMIN', permissions: [], jti: 'test' },
        testKey.privateKey,
        { algorithm: 'RS256', expiresIn: 900, issuer: 'signalrisk-auth', keyid: 'unknown-kid' },
      );

      await expect(service.verifyAccessToken(token)).rejects.toThrow(
        'Unknown signing key',
      );
    });
  });

  describe('generateRefreshToken', () => {
    it('should return an opaque token with hash and expiry', () => {
      const result = service.generateRefreshToken('user-001', 'merchant-001');

      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThan(20);
      expect(result.tokenHash).toBeDefined();
      expect(result.tokenHash).toHaveLength(64); // SHA-256 hex
      expect(result.jti).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should produce different tokens on each call', () => {
      const r1 = service.generateRefreshToken('user-001', 'merchant-001');
      const r2 = service.generateRefreshToken('user-001', 'merchant-001');

      expect(r1.token).not.toBe(r2.token);
      expect(r1.tokenHash).not.toBe(r2.tokenHash);
    });
  });

  describe('hashRefreshToken (static)', () => {
    it('should produce consistent SHA-256 hash', () => {
      const token = 'test-refresh-token';
      const hash1 = JwtTokenService.hashRefreshToken(token);
      const hash2 = JwtTokenService.hashRefreshToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });
});
