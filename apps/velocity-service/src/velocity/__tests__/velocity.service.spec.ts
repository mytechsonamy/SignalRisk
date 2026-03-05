/**
 * Unit tests for VelocityService
 *
 * Tests Redis sorted set operations, windowed queries, and pruning behavior
 * using a mock Redis client.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VelocityService } from '../velocity.service';
import { VelocityEvent } from '../velocity.types';

// Mock ioredis
const mockPipelineExec = jest.fn();
const mockPipeline = {
  zadd: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  pfadd: jest.fn().mockReturnThis(),
  zremrangebyscore: jest.fn().mockReturnThis(),
  zcount: jest.fn().mockReturnThis(),
  zrangebyscore: jest.fn().mockReturnThis(),
  pfcount: jest.fn().mockReturnThis(),
  exec: mockPipelineExec,
};

const mockRedis = {
  pipeline: jest.fn().mockReturnValue(mockPipeline),
  zremrangebyscore: jest.fn().mockResolvedValue(0),
  zcount: jest.fn().mockResolvedValue(0),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue('OK'),
  on: jest.fn(),
};

jest.mock('ioredis', () => {
  const MockRedis = jest.fn().mockImplementation(() => mockRedis);
  return { __esModule: true, default: MockRedis };
});

describe('VelocityService', () => {
  let service: VelocityService;

  const mockConfig = {
    'redis.host': 'localhost',
    'redis.port': 6379,
    'redis.password': undefined,
    'redis.db': 0,
    'redis.connectTimeout': 5000,
    'redis.maxRetriesPerRequest': 3,
    'velocity.keyTtlSeconds': 90000,
    'velocity.window1h': 3600,
    'velocity.window24h': 86400,
    'velocity.baselineWindowSeconds': 604800,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VelocityService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockConfig[key as keyof typeof mockConfig]),
          },
        },
      ],
    }).compile();

    service = module.get<VelocityService>(VelocityService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('incrementVelocity', () => {
    it('should add transaction to sorted set with timestamp as score', async () => {
      const event: VelocityEvent = {
        eventId: 'evt-001',
        merchantId: 'merchant-1',
        entityId: 'entity-1',
        amountMinor: 10000,
        timestampSeconds: 1700000000,
      };

      mockPipelineExec.mockResolvedValue([]);

      await service.incrementVelocity(event);

      expect(mockRedis.pipeline).toHaveBeenCalled();
      // Transaction sorted set
      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        'merchant-1:vel:tx:entity-1',
        1700000000,
        'evt-001',
      );
      // Amount sorted set
      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        'merchant-1:vel:amt:entity-1',
        1700000000,
        '10000:evt-001',
      );
      // Baseline sorted set
      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        'merchant-1:vel:baseline:entity-1',
        1700000000,
        'evt-001',
      );
    });

    it('should set TTL on all sorted set keys', async () => {
      const event: VelocityEvent = {
        eventId: 'evt-002',
        merchantId: 'merchant-1',
        entityId: 'entity-1',
        amountMinor: 5000,
        timestampSeconds: 1700000000,
      };

      mockPipelineExec.mockResolvedValue([]);

      await service.incrementVelocity(event);

      // TTL set for tx and amt keys (90000s)
      expect(mockPipeline.expire).toHaveBeenCalledWith(
        'merchant-1:vel:tx:entity-1',
        90000,
      );
      expect(mockPipeline.expire).toHaveBeenCalledWith(
        'merchant-1:vel:amt:entity-1',
        90000,
      );
    });

    it('should add device fingerprint to HyperLogLog when present', async () => {
      const event: VelocityEvent = {
        eventId: 'evt-003',
        merchantId: 'merchant-1',
        entityId: 'entity-1',
        amountMinor: 1000,
        deviceFingerprint: 'fp-abc123',
        timestampSeconds: 1700000000,
      };

      mockPipelineExec.mockResolvedValue([]);

      await service.incrementVelocity(event);

      expect(mockPipeline.pfadd).toHaveBeenCalledWith(
        'merchant-1:vel:udev:entity-1',
        'fp-abc123',
      );
    });

    it('should add IP address to HyperLogLog when present', async () => {
      const event: VelocityEvent = {
        eventId: 'evt-004',
        merchantId: 'merchant-1',
        entityId: 'entity-1',
        amountMinor: 1000,
        ipAddress: '192.168.1.1',
        timestampSeconds: 1700000000,
      };

      mockPipelineExec.mockResolvedValue([]);

      await service.incrementVelocity(event);

      expect(mockPipeline.pfadd).toHaveBeenCalledWith(
        'merchant-1:vel:uip:entity-1',
        '192.168.1.1',
      );
    });

    it('should add session ID to HyperLogLog when present', async () => {
      const event: VelocityEvent = {
        eventId: 'evt-005',
        merchantId: 'merchant-1',
        entityId: 'entity-1',
        amountMinor: 1000,
        sessionId: 'sess-xyz',
        timestampSeconds: 1700000000,
      };

      mockPipelineExec.mockResolvedValue([]);

      await service.incrementVelocity(event);

      expect(mockPipeline.pfadd).toHaveBeenCalledWith(
        'merchant-1:vel:usess:entity-1',
        'sess-xyz',
      );
    });

    it('should NOT add HyperLogLog entries when optional fields are absent', async () => {
      const event: VelocityEvent = {
        eventId: 'evt-006',
        merchantId: 'merchant-1',
        entityId: 'entity-1',
        amountMinor: 1000,
        timestampSeconds: 1700000000,
      };

      mockPipelineExec.mockResolvedValue([]);

      await service.incrementVelocity(event);

      // pfadd should NOT be called for devices, IPs, or sessions
      expect(mockPipeline.pfadd).not.toHaveBeenCalled();
    });

    it('should use merchant-scoped Redis keys for tenant isolation', async () => {
      const event: VelocityEvent = {
        eventId: 'evt-007',
        merchantId: 'tenant-42',
        entityId: 'card-hash-99',
        amountMinor: 5000,
        deviceFingerprint: 'fp-1',
        ipAddress: '10.0.0.1',
        sessionId: 'sess-1',
        timestampSeconds: 1700000000,
      };

      mockPipelineExec.mockResolvedValue([]);

      await service.incrementVelocity(event);

      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        'tenant-42:vel:tx:card-hash-99',
        expect.any(Number),
        expect.any(String),
      );
      expect(mockPipeline.pfadd).toHaveBeenCalledWith(
        'tenant-42:vel:udev:card-hash-99',
        'fp-1',
      );
      expect(mockPipeline.pfadd).toHaveBeenCalledWith(
        'tenant-42:vel:uip:card-hash-99',
        '10.0.0.1',
      );
    });
  });

  describe('getVelocitySignals', () => {
    it('should return all 6 velocity dimensions', async () => {
      // Mock pipeline results (indexed by command order):
      // 0: zremrangebyscore tx (prune)
      // 1: zremrangebyscore amt (prune)
      // 2: zcount tx 1h
      // 3: zcount tx 24h
      // 4: zrangebyscore amt 1h
      // 5: pfcount udev
      // 6: pfcount uip
      // 7: pfcount usess
      mockPipelineExec.mockResolvedValue([
        [null, 0],       // prune tx
        [null, 0],       // prune amt
        [null, 5],       // tx_count_1h = 5
        [null, 20],      // tx_count_24h = 20
        [null, ['1000:evt-1', '2500:evt-2', '500:evt-3']],  // amounts
        [null, 3],       // unique_devices_24h = 3
        [null, 7],       // unique_ips_24h = 7
        [null, 2],       // unique_sessions_1h = 2
      ]);

      const signals = await service.getVelocitySignals('merchant-1', 'entity-1');

      expect(signals.tx_count_1h).toBe(5);
      expect(signals.tx_count_24h).toBe(20);
      expect(signals.amount_sum_1h).toBe(4000); // 1000 + 2500 + 500
      expect(signals.unique_devices_24h).toBe(3);
      expect(signals.unique_ips_24h).toBe(7);
      expect(signals.unique_sessions_1h).toBe(2);
      expect(signals.burst_detected).toBe(false);
    });

    it('should prune entries older than 24h window on read', async () => {
      mockPipelineExec.mockResolvedValue([
        [null, 2],  // pruned 2 entries from tx
        [null, 1],  // pruned 1 entry from amt
        [null, 0],
        [null, 0],
        [null, []],
        [null, 0],
        [null, 0],
        [null, 0],
      ]);

      await service.getVelocitySignals('merchant-1', 'entity-1');

      // Should call zremrangebyscore for tx and amt keys
      expect(mockPipeline.zremrangebyscore).toHaveBeenCalledTimes(2);
      expect(mockPipeline.zremrangebyscore).toHaveBeenCalledWith(
        'merchant-1:vel:tx:entity-1',
        '-inf',
        expect.any(Number),
      );
      expect(mockPipeline.zremrangebyscore).toHaveBeenCalledWith(
        'merchant-1:vel:amt:entity-1',
        '-inf',
        expect.any(Number),
      );
    });

    it('should return zero signals when no data exists', async () => {
      mockPipelineExec.mockResolvedValue([
        [null, 0],
        [null, 0],
        [null, 0],
        [null, 0],
        [null, []],
        [null, 0],
        [null, 0],
        [null, 0],
      ]);

      const signals = await service.getVelocitySignals('merchant-1', 'unknown-entity');

      expect(signals.tx_count_1h).toBe(0);
      expect(signals.tx_count_24h).toBe(0);
      expect(signals.amount_sum_1h).toBe(0);
      expect(signals.unique_devices_24h).toBe(0);
      expect(signals.unique_ips_24h).toBe(0);
      expect(signals.unique_sessions_1h).toBe(0);
    });

    it('should handle null pipeline results gracefully', async () => {
      mockPipelineExec.mockResolvedValue(null);

      const signals = await service.getVelocitySignals('merchant-1', 'entity-1');

      expect(signals.tx_count_1h).toBe(0);
      expect(signals.tx_count_24h).toBe(0);
      expect(signals.amount_sum_1h).toBe(0);
    });

    it('should correctly sum amounts from encoded sorted set members', async () => {
      mockPipelineExec.mockResolvedValue([
        [null, 0],
        [null, 0],
        [null, 3],
        [null, 3],
        [null, ['15000:evt-a', '250:evt-b', '99999:evt-c']],
        [null, 0],
        [null, 0],
        [null, 0],
      ]);

      const signals = await service.getVelocitySignals('merchant-1', 'entity-1');

      expect(signals.amount_sum_1h).toBe(115249); // 15000 + 250 + 99999
    });
  });

  describe('getBaseline', () => {
    it('should return average hourly count over 7-day window', async () => {
      // 168 events over 7 days = 1 event per hour average
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcount.mockResolvedValue(168);

      const baseline = await service.getBaseline('merchant-1', 'entity-1');

      // 168 / 168 hours = 1.0
      expect(baseline).toBe(1);
    });

    it('should return 0 when no baseline data exists', async () => {
      mockRedis.zremrangebyscore.mockResolvedValue(0);
      mockRedis.zcount.mockResolvedValue(0);

      const baseline = await service.getBaseline('merchant-1', 'entity-1');

      expect(baseline).toBe(0);
    });

    it('should prune entries older than 7 days', async () => {
      mockRedis.zremrangebyscore.mockResolvedValue(5);
      mockRedis.zcount.mockResolvedValue(100);

      await service.getBaseline('merchant-1', 'entity-1');

      expect(mockRedis.zremrangebyscore).toHaveBeenCalledWith(
        'merchant-1:vel:baseline:entity-1',
        '-inf',
        expect.any(Number),
      );
    });
  });
});
