import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { MerchantsService, Merchant } from '../merchants/merchants.service';
import { JwtTokenService } from '../jwt/jwt.service';
import { KeyManager, ManagedKey } from '../jwt/key-manager';

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

describe('AuthService', () => {
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

  beforeEach(async () => {
    const keyManager = {
      getCurrentSigningKey: jest.fn().mockReturnValue(testKey),
      getKeyByKid: jest.fn().mockReturnValue(testKey),
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

    jwtTokenService = new JwtTokenService(keyManager, configService);

    merchantsService = {
      findByClientId: jest.fn(),
    } as any;

    authService = new AuthService(
      jwtTokenService,
      configService,
      merchantsService,
    );
  });

  describe('validateCredentials', () => {
    it('should return merchant when credentials are valid', async () => {
      jest
        .spyOn(merchantsService, 'findByClientId')
        .mockReturnValue(mockMerchant);

      const result = await authService.validateCredentials(
        'sr_test_client_id',
        'test-secret',
      );

      expect(result).toEqual(mockMerchant);
      expect(merchantsService.findByClientId).toHaveBeenCalledWith(
        'sr_test_client_id',
      );
    });

    it('should throw UnauthorizedException when client_id is unknown', async () => {
      jest
        .spyOn(merchantsService, 'findByClientId')
        .mockReturnValue(undefined);

      await expect(
        authService.validateCredentials('unknown_id', 'any-secret'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when merchant is inactive', async () => {
      const inactiveMerchant = { ...mockMerchant, active: false };
      jest
        .spyOn(merchantsService, 'findByClientId')
        .mockReturnValue(inactiveMerchant);

      await expect(
        authService.validateCredentials('sr_test_client_id', 'test-secret'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when secret is wrong', async () => {
      jest
        .spyOn(merchantsService, 'findByClientId')
        .mockReturnValue(mockMerchant);

      await expect(
        authService.validateCredentials('sr_test_client_id', 'wrong-secret'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('issueToken', () => {
    it('should return a valid token response with refresh token', async () => {
      const result = await authService.issueToken(mockMerchant);

      expect(result.access_token).toBeDefined();
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(900);
      expect(result.refresh_token).toBeDefined();
    });
  });
});
