import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { JwtTokenService } from '../../jwt/jwt.service';
import { KeyManager, ManagedKey } from '../../jwt/key-manager';
import { MerchantsService, Merchant } from '../../merchants/merchants.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

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

describe('Token Flow (issue, refresh, revoke)', () => {
  let authService: AuthService;
  let jwtTokenService: JwtTokenService;
  let merchantsService: MerchantsService;
  let testKey: ManagedKey;

  const testSecretHash = bcrypt.hashSync('test-secret', 10);

  const mockMerchant: Merchant = {
    id: 'merchant-001',
    name: 'Test Merchant',
    clientId: 'sr_test_client_id',
    clientSecretHash: testSecretHash,
    roles: ['merchant'],
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(() => {
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
    const keyManager = {
      getCurrentSigningKey: jest.fn().mockReturnValue(testKey),
      getKeyByKid: jest.fn().mockReturnValue(testKey),
      getAllActivePublicKeys: jest.fn().mockReturnValue([]),
    } as any as KeyManager;

    const configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          JWT_ACCESS_TOKEN_TTL_SECONDS: 900,
          JWT_REFRESH_TOKEN_TTL_SECONDS: 604800,
          JWT_ISSUER: 'signalrisk-auth',
        };
        return config[key] ?? defaultValue;
      }),
    } as any as ConfigService;

    jwtTokenService = new JwtTokenService(keyManager, configService);

    merchantsService = {
      findByClientId: jest.fn().mockReturnValue(mockMerchant),
      findById: jest.fn(),
    } as any;

    authService = new AuthService(jwtTokenService, configService, merchantsService);
  });

  describe('Issue token', () => {
    it('should issue access token and refresh token for merchant', async () => {
      const result = await authService.issueToken(mockMerchant);

      expect(result.access_token).toBeDefined();
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(900);
      expect(result.refresh_token).toBeDefined();
    });

    it('should issue token for user with correct claims', async () => {
      const result = await authService.issueTokenForUser({
        userId: 'user-123',
        merchantId: 'merchant-001',
        role: 'ANALYST',
        permissions: ['read', 'review'],
      });

      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();
      expect(result.token_type).toBe('Bearer');

      // Verify the access token contains correct claims
      const payload = await jwtTokenService.verifyAccessToken(
        result.access_token,
      );
      expect(payload.sub).toBe('user-123');
      expect(payload.merchant_id).toBe('merchant-001');
      expect(payload.role).toBe('ANALYST');
      expect(payload.permissions).toEqual(['read', 'review']);
    });
  });

  describe('Refresh token', () => {
    it('should refresh an access token using a valid refresh token', async () => {
      // Issue initial tokens
      const initial = await authService.issueToken(mockMerchant);
      expect(initial.refresh_token).toBeDefined();

      // Use refresh token to get a new access token
      const refreshed = await authService.refreshAccessToken(
        initial.refresh_token!,
      );

      expect(refreshed.access_token).toBeDefined();
      expect(refreshed.access_token).not.toBe(initial.access_token);
      expect(refreshed.refresh_token).toBeDefined();
      expect(refreshed.refresh_token).not.toBe(initial.refresh_token);
      expect(refreshed.token_type).toBe('Bearer');
    });

    it('should reject reuse of a rotated refresh token', async () => {
      const initial = await authService.issueToken(mockMerchant);

      // First refresh succeeds
      await authService.refreshAccessToken(initial.refresh_token!);

      // Second use of the same refresh token should fail (it was rotated)
      await expect(
        authService.refreshAccessToken(initial.refresh_token!),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject an invalid refresh token', async () => {
      await expect(
        authService.refreshAccessToken('invalid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Revoke token', () => {
    it('should revoke a refresh token so it cannot be used again', async () => {
      const initial = await authService.issueToken(mockMerchant);

      // Revoke
      await authService.revokeToken(initial.refresh_token!);

      // Attempt to use revoked token
      await expect(
        authService.refreshAccessToken(initial.refresh_token!),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should not throw when revoking an unknown token', async () => {
      // RFC 7009: revocation should succeed even for unknown tokens
      await expect(
        authService.revokeToken('unknown-token'),
      ).resolves.not.toThrow();
    });
  });

  describe('Introspect token', () => {
    it('should return active=true for a valid access token', async () => {
      const tokens = await authService.issueToken(mockMerchant);
      const result = await authService.introspectToken(tokens.access_token);

      expect(result.active).toBe(true);
      expect(result.sub).toBe('merchant-001');
      expect(result.merchant_id).toBe('merchant-001');
      expect(result.token_type).toBe('Bearer');
    });

    it('should return active=true for a valid refresh token', async () => {
      const tokens = await authService.issueToken(mockMerchant);
      const result = await authService.introspectToken(
        tokens.refresh_token!,
        'refresh_token',
      );

      expect(result.active).toBe(true);
      expect(result.sub).toBe('merchant-001');
      expect(result.token_type).toBe('refresh_token');
    });

    it('should return active=false for an invalid token', async () => {
      const result = await authService.introspectToken('garbage-token');
      expect(result.active).toBe(false);
    });

    it('should return active=false for a revoked refresh token', async () => {
      const tokens = await authService.issueToken(mockMerchant);
      await authService.revokeToken(tokens.refresh_token!);

      const result = await authService.introspectToken(
        tokens.refresh_token!,
        'refresh_token',
      );
      expect(result.active).toBe(false);
    });
  });
});
