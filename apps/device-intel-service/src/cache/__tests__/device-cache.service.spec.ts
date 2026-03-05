import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DeviceCacheService } from '../device-cache.service';
import { Device } from '../../fingerprint/interfaces/device-attributes.interface';

// ---------------------------------------------------------------------------
// Mock ioredis
// ---------------------------------------------------------------------------

const mockPipeline = {
  setex: jest.fn().mockReturnThis(),
  del: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

const mockRedis = {
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  pipeline: jest.fn().mockReturnValue(mockPipeline),
  on: jest.fn(),
  status: 'ready',
};

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockRedis),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDevice(overrides?: Partial<Device>): Device {
  return {
    id: 'device-001',
    merchantId: 'merchant-001',
    fingerprint: 'a'.repeat(64),
    fingerprintPrefix: 'a'.repeat(8),
    trustScore: 50,
    isEmulator: false,
    attributes: {
      screenResolution: '1920x1080',
      gpuRenderer: 'NVIDIA GTX 1080',
      timezone: 'Africa/Johannesburg',
      language: 'en-ZA',
      webglHash: 'abc123',
      canvasHash: 'canvas789',
      platform: 'web' as const,
    },
    firstSeenAt: new Date('2026-01-01T00:00:00Z'),
    lastSeenAt: new Date('2026-03-01T00:00:00Z'),
    ...overrides,
  };
}

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      redis: {
        host: 'localhost',
        port: 6379,
        password: undefined,
        db: 0,
        keyPrefix: '',
      },
      'cache.ttlSeconds': 86400,
    };
    return config[key];
  }),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeviceCacheService', () => {
  let service: DeviceCacheService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceCacheService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<DeviceCacheService>(DeviceCacheService);
  });

  // -------------------------------------------------------------------------
  // getByFingerprint
  // -------------------------------------------------------------------------

  describe('getByFingerprint', () => {
    it('should return null on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getByFingerprint('merchant-001', 'somefp');
      expect(result).toBeNull();
    });

    it('should return deserialized device on cache hit', async () => {
      const device = makeDevice();
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          ...device,
          firstSeenAt: device.firstSeenAt.toISOString(),
          lastSeenAt: device.lastSeenAt.toISOString(),
        }),
      );

      const result = await service.getByFingerprint('merchant-001', device.fingerprint);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('device-001');
      expect(result!.firstSeenAt).toBeInstanceOf(Date);
      expect(result!.lastSeenAt).toBeInstanceOf(Date);
    });

    it('should return null on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection refused'));

      const result = await service.getByFingerprint('merchant-001', 'somefp');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getById
  // -------------------------------------------------------------------------

  describe('getById', () => {
    it('should return null on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getById('merchant-001', 'device-001');
      expect(result).toBeNull();
    });

    it('should return device on cache hit', async () => {
      const device = makeDevice();
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          ...device,
          firstSeenAt: device.firstSeenAt.toISOString(),
          lastSeenAt: device.lastSeenAt.toISOString(),
        }),
      );

      const result = await service.getById('merchant-001', 'device-001');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('device-001');
    });
  });

  // -------------------------------------------------------------------------
  // setDevice
  // -------------------------------------------------------------------------

  describe('setDevice', () => {
    it('should cache device under both fingerprint and ID keys', async () => {
      const device = makeDevice();

      await service.setDevice('merchant-001', device);

      expect(mockPipeline.setex).toHaveBeenCalledTimes(2);
      expect(mockPipeline.setex).toHaveBeenCalledWith(
        `merchant-001:dev:fp:${device.fingerprint}`,
        86400,
        expect.any(String),
      );
      expect(mockPipeline.setex).toHaveBeenCalledWith(
        `merchant-001:dev:id:${device.id}`,
        86400,
        expect.any(String),
      );
      expect(mockPipeline.exec).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // invalidate
  // -------------------------------------------------------------------------

  describe('invalidate', () => {
    it('should delete both ID and fingerprint keys when cached data exists', async () => {
      const device = makeDevice();
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          ...device,
          firstSeenAt: device.firstSeenAt.toISOString(),
          lastSeenAt: device.lastSeenAt.toISOString(),
        }),
      );

      await service.invalidate('merchant-001', 'device-001');

      expect(mockPipeline.del).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should only delete ID key when no cached data', async () => {
      mockRedis.get.mockResolvedValue(null);

      await service.invalidate('merchant-001', 'device-001');

      expect(mockPipeline.del).toHaveBeenCalledTimes(1);
      expect(mockPipeline.del).toHaveBeenCalledWith('merchant-001:dev:id:device-001');
    });
  });

  // -------------------------------------------------------------------------
  // isConnected
  // -------------------------------------------------------------------------

  describe('isConnected', () => {
    it('should return true when Redis status is ready', () => {
      expect(service.isConnected()).toBe(true);
    });
  });
});
