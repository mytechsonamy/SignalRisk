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

describe('AuthService.refreshAccessToken — role precedence & deleted user', () => {
  let authService: AuthService;
  let jwtTokenService: JwtTokenService;
  let merchantsService: jest.Mocked<Pick<MerchantsService, 'findByClientId' | 'findById'>>;
  let testKey: ManagedKey;

  const testSecretHash = bcrypt.hashSync('test-secret', 10);

  const buildMerchant = (roles: string[]): Merchant => ({
    id: 'merchant-001',
    name: 'Test Merchant',
    clientId: 'sr_test_client_id',
    clientSecretHash: testSecretHash,
    roles,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeAll(() => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    testKey = {
      kid: 'test-kid-refresh',
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
      findByClientId: jest.fn(),
      findById: jest.fn(),
    } as any;

    authService = new AuthService(jwtTokenService, configService, merchantsService as any);
  });

  it('admin merchant (roles: ["merchant","admin"]) — refreshed token has role "admin"', async () => {
    const adminMerchant = buildMerchant(['merchant', 'admin']);

    // Issue initial tokens using the base merchant
    const initial = await authService.issueToken(adminMerchant);

    // On refresh, findById returns the admin merchant
    (merchantsService.findById as jest.Mock).mockReturnValue(adminMerchant);

    const refreshed = await authService.refreshAccessToken(initial.refresh_token!);

    const payload = await jwtTokenService.verifyAccessToken(refreshed.access_token);
    expect(payload.role).toBe('admin');
  });

  it('merchant-only (roles: ["merchant"]) — refreshed token has role "merchant"', async () => {
    const regularMerchant = buildMerchant(['merchant']);

    const initial = await authService.issueToken(regularMerchant);

    (merchantsService.findById as jest.Mock).mockReturnValue(regularMerchant);

    const refreshed = await authService.refreshAccessToken(initial.refresh_token!);

    const payload = await jwtTokenService.verifyAccessToken(refreshed.access_token);
    expect(payload.role).toBe('merchant');
  });

  it('deleted user (findById returns null) — throws UnauthorizedException with "Account not found"', async () => {
    const merchant = buildMerchant(['merchant']);

    const initial = await authService.issueToken(merchant);

    // Simulate deleted user: findById returns undefined (null-like)
    (merchantsService.findById as jest.Mock).mockReturnValue(undefined);

    await expect(
      authService.refreshAccessToken(initial.refresh_token!),
    ).rejects.toThrow(new UnauthorizedException('Account not found'));
  });
});
