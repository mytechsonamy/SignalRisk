import { TenantMiddleware } from '../tenant.middleware';
import { TenantContextService } from '../tenant-context.service';
import { KeyManager, ManagedKey } from '../../jwt/key-manager';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import * as jsonwebtoken from 'jsonwebtoken';

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  let tenantContextService: TenantContextService;
  let keyManager: jest.Mocked<KeyManager>;
  let keyPair: { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject };

  beforeAll(() => {
    // Generate a real RSA key pair for signing test tokens
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    keyPair = { privateKey, publicKey };
  });

  beforeEach(() => {
    tenantContextService = new TenantContextService();

    const mockManagedKey: ManagedKey = {
      kid: 'test-kid-1',
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      createdAt: new Date(),
      active: true,
    };

    keyManager = {
      getCurrentSigningKey: jest.fn().mockReturnValue(mockManagedKey),
      getKeyByKid: jest.fn().mockReturnValue(mockManagedKey),
    } as unknown as jest.Mocked<KeyManager>;

    middleware = new TenantMiddleware(keyManager, tenantContextService);
  });

  function buildRequest(authHeader?: string): Request {
    return {
      headers: authHeader ? { authorization: authHeader } : {},
    } as unknown as Request;
  }

  function buildResponse(): Response {
    return {} as Response;
  }

  function signToken(payload: object, expiresIn = '1h'): string {
    const privateKeyPem = keyPair.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    return jsonwebtoken.sign(payload, privateKeyPem, {
      algorithm: 'RS256',
      keyid: 'test-kid-1',
      expiresIn,
    });
  }

  it('should call next() immediately when no Authorization header is present', () => {
    const next = jest.fn();
    middleware.use(buildRequest(), buildResponse(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should call next() without context when Authorization header has wrong scheme', () => {
    const next = jest.fn();
    middleware.use(buildRequest('Basic dXNlcjpwYXNz'), buildResponse(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(tenantContextService.getMerchantId()).toBeUndefined();
  });

  it('should set tenant context and call next() for a valid JWT', () => {
    const token = signToken({
      sub: 'user-456',
      merchant_id: 'merchant-abc',
      role: 'merchant',
      iss: 'signalrisk-auth',
    });

    let capturedMerchantId: string | undefined;
    const next = jest.fn().mockImplementation(() => {
      capturedMerchantId = tenantContextService.getMerchantId();
    });

    middleware.use(buildRequest(`Bearer ${token}`), buildResponse(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(capturedMerchantId).toBe('merchant-abc');
  });

  it('should set userId and role in context', () => {
    const token = signToken({
      sub: 'user-789',
      merchant_id: 'merch-xyz',
      role: 'admin',
    });

    let capturedContext: ReturnType<TenantContextService['getContext']>;
    const next = jest.fn().mockImplementation(() => {
      capturedContext = tenantContextService.getContext();
    });

    middleware.use(buildRequest(`Bearer ${token}`), buildResponse(), next);

    expect(capturedContext).toEqual({
      merchantId: 'merch-xyz',
      userId: 'user-789',
      role: 'admin',
    });
  });

  it('should call next() without context for an expired JWT', () => {
    // Sign a token that is already expired (issued in the past)
    const expiredToken = signToken(
      {
        sub: 'user-1',
        merchant_id: 'merch-1',
        role: 'merchant',
      },
      '-1s', // expired 1 second ago
    );

    const next = jest.fn();
    middleware.use(buildRequest(`Bearer ${expiredToken}`), buildResponse(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(tenantContextService.getMerchantId()).toBeUndefined();
  });

  it('should call next() without context for a token with invalid signature', () => {
    const token = signToken({ sub: 'u1', merchant_id: 'm1', role: 'merchant' });
    // Tamper with the payload
    const [header, , sig] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'hacker', merchant_id: 'evil-merch', role: 'admin', exp: 9999999999 }),
    ).toString('base64url');
    const tamperedToken = `${header}.${tamperedPayload}.${sig}`;

    const next = jest.fn();
    middleware.use(buildRequest(`Bearer ${tamperedToken}`), buildResponse(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(tenantContextService.getMerchantId()).toBeUndefined();
  });

  it('should call next() without context for a malformed token', () => {
    const next = jest.fn();
    middleware.use(buildRequest('Bearer not.a.valid.jwt.structure'), buildResponse(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should default role to "unknown" when role is not in payload', () => {
    const token = signToken({ sub: 'u1', merchant_id: 'merch-1' });

    let capturedContext: ReturnType<TenantContextService['getContext']>;
    const next = jest.fn().mockImplementation(() => {
      capturedContext = tenantContextService.getContext();
    });

    middleware.use(buildRequest(`Bearer ${token}`), buildResponse(), next);

    expect(capturedContext?.role).toBe('unknown');
  });
});
