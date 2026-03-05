import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { MerchantsService, Merchant } from '../merchants/merchants.service';

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
  let jwtService: JwtService;
  let merchantsService: MerchantsService;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                JWT_EXPIRES_IN_SECONDS: 3600,
                JWT_PUBLIC_KEY: undefined,
                JWT_KID: 'test-kid',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: MerchantsService,
          useValue: {
            findByClientId: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    merchantsService = module.get<MerchantsService>(MerchantsService);
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
    it('should return a valid token response', async () => {
      const result = await authService.issueToken(mockMerchant);

      expect(result).toEqual({
        access_token: 'mock-jwt-token',
        token_type: 'Bearer',
        expires_in: 3600,
      });
    });

    it('should sign token with correct payload fields', async () => {
      await authService.issueToken(mockMerchant);

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'merchant-001',
          client_id: 'sr_test_client_id',
          merchant_name: 'Test Merchant',
          roles: ['merchant'],
          jti: expect.any(String),
        }),
        { expiresIn: 3600 },
      );
    });

    it('should generate unique jti for each token', async () => {
      await authService.issueToken(mockMerchant);
      await authService.issueToken(mockMerchant);

      const calls = (jwtService.signAsync as jest.Mock).mock.calls;
      const jti1 = calls[0][0].jti;
      const jti2 = calls[1][0].jti;
      expect(jti1).not.toEqual(jti2);
    });
  });

  describe('getJwks', () => {
    it('should return empty keys array when no public key configured', async () => {
      const result = await authService.getJwks();
      expect(result).toEqual({ keys: [] });
    });
  });
});
