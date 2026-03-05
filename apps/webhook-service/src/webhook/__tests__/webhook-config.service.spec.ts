import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebhookConfigService } from '../webhook-config.service';

// ---------------------------------------------------------------------------
// Mock ioredis
// ---------------------------------------------------------------------------

const mockSet = jest.fn();
const mockGet = jest.fn();
const mockDel = jest.fn();
const mockOn = jest.fn();
const mockQuit = jest.fn().mockResolvedValue(undefined);
const mockRpush = jest.fn();

jest.mock('ioredis', () => ({
  default: jest.fn().mockImplementation(() => ({
    set: mockSet,
    get: mockGet,
    del: mockDel,
    on: mockOn,
    quit: mockQuit,
    rpush: mockRpush,
  })),
}));

const mockConfigService = {
  get: jest.fn().mockReturnValue({
    host: 'localhost',
    port: 6379,
    db: 0,
  }),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebhookConfigService', () => {
  let service: WebhookConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookConfigService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<WebhookConfigService>(WebhookConfigService);
    service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  // -------------------------------------------------------------------------

  describe('setWebhookConfig', () => {
    it('should store webhook config with the correct Redis key', async () => {
      mockSet.mockResolvedValue('OK');

      await service.setWebhookConfig('merchant-001', 'https://example.com/webhook', 'secret123');

      expect(mockSet).toHaveBeenCalledWith(
        'webhook:merchant-001',
        expect.any(String),
        'EX',
        expect.any(Number),
      );
    });

    it('should store the URL and secret as JSON', async () => {
      mockSet.mockResolvedValue('OK');

      await service.setWebhookConfig('merchant-001', 'https://example.com/webhook', 'secret123');

      const storedValue = mockSet.mock.calls[0][1] as string;
      const parsed = JSON.parse(storedValue) as { url: string; secret: string };
      expect(parsed.url).toBe('https://example.com/webhook');
      expect(parsed.secret).toBe('secret123');
    });

    it('should set TTL of 30 days (2592000 seconds)', async () => {
      mockSet.mockResolvedValue('OK');

      await service.setWebhookConfig('merchant-001', 'https://example.com/webhook', 'secret123');

      expect(mockSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'EX',
        2592000,
      );
    });

    it('should handle different merchant IDs', async () => {
      mockSet.mockResolvedValue('OK');

      await service.setWebhookConfig('merchant-abc', 'https://abc.com/hook', 'abc-secret');

      expect(mockSet).toHaveBeenCalledWith(
        'webhook:merchant-abc',
        expect.any(String),
        'EX',
        expect.any(Number),
      );
    });
  });

  describe('getWebhookConfig', () => {
    it('should return parsed webhook config when found in Redis', async () => {
      mockGet.mockResolvedValue(
        JSON.stringify({ url: 'https://example.com/webhook', secret: 'my-secret' }),
      );

      const result = await service.getWebhookConfig('merchant-001');

      expect(result).toEqual({
        merchantId: 'merchant-001',
        url: 'https://example.com/webhook',
        secret: 'my-secret',
      });
    });

    it('should return null when Redis returns null', async () => {
      mockGet.mockResolvedValue(null);

      const result = await service.getWebhookConfig('merchant-001');

      expect(result).toBeNull();
    });

    it('should query Redis with the correct key', async () => {
      mockGet.mockResolvedValue(null);

      await service.getWebhookConfig('merchant-xyz');

      expect(mockGet).toHaveBeenCalledWith('webhook:merchant-xyz');
    });

    it('should return null when Redis value is invalid JSON', async () => {
      mockGet.mockResolvedValue('not-valid-json{{{{');

      const result = await service.getWebhookConfig('merchant-001');

      expect(result).toBeNull();
    });

    it('should include merchantId in returned config', async () => {
      mockGet.mockResolvedValue(
        JSON.stringify({ url: 'https://test.com/hook', secret: 'test-secret' }),
      );

      const result = await service.getWebhookConfig('merchant-007');

      expect(result?.merchantId).toBe('merchant-007');
    });
  });

  describe('deleteWebhookConfig', () => {
    it('should call Redis del with the correct key', async () => {
      mockDel.mockResolvedValue(1);

      await service.deleteWebhookConfig('merchant-001');

      expect(mockDel).toHaveBeenCalledWith('webhook:merchant-001');
    });

    it('should call Redis del for different merchant IDs', async () => {
      mockDel.mockResolvedValue(1);

      await service.deleteWebhookConfig('merchant-xyz');

      expect(mockDel).toHaveBeenCalledWith('webhook:merchant-xyz');
    });
  });

  describe('onModuleDestroy', () => {
    it('should call redis.quit on module destroy', async () => {
      await service.onModuleDestroy();
      expect(mockQuit).toHaveBeenCalled();
    });
  });

  describe('getRedis', () => {
    it('should return the redis instance', () => {
      const redis = service.getRedis();
      expect(redis).toBeDefined();
    });
  });
});
