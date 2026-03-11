/**
 * Sprint 7: Sequence Detection Service tests
 *
 * Tests the 3 sequence patterns:
 * 1. login → payment within 15m
 * 2. 3× failed_payment → success within 10m
 * 3. device_change → payment within 30m
 */

import { SequenceService, SequenceEvent } from '../sequence.service';

// Mock Redis
const mockPipeline = {
  lpush: jest.fn().mockReturnThis(),
  ltrim: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  lrange: jest.fn().mockReturnThis(),
  exec: jest.fn(),
};

const mockRedis = {
  pipeline: jest.fn(() => mockPipeline),
  lrange: jest.fn(),
};

describe('SequenceService', () => {
  let service: SequenceService;
  const now = Math.floor(Date.now() / 1000);

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SequenceService(mockRedis as never);
  });

  // -----------------------------------------------------------------------
  // Sequence 1: login → payment within 15m
  // -----------------------------------------------------------------------

  describe('loginThenPayment15m', () => {
    it('detects login followed by payment within 15 minutes', async () => {
      const loginTs = now - 600; // 10 minutes ago
      mockPipeline.exec.mockResolvedValue([
        [null, 1],    // lpush
        [null, 'OK'], // ltrim
        [null, 1],    // expire
        [null, [`payment:${now}`, `login:${loginTs}`]], // lrange
      ]);

      const result = await service.recordAndDetect({
        merchantId: 'merch-1',
        entityType: 'customer',
        entityId: 'user-1',
        eventType: 'payment',
        timestampSeconds: now,
      });

      expect(result.loginThenPayment15m).toBe(true);
    });

    it('does NOT detect login → payment if login was > 15m ago', async () => {
      const loginTs = now - 1000; // ~16.7 minutes ago
      mockPipeline.exec.mockResolvedValue([
        [null, 1], [null, 'OK'], [null, 1],
        [null, [`payment:${now}`, `login:${loginTs}`]],
      ]);

      const result = await service.recordAndDetect({
        merchantId: 'merch-1',
        entityType: 'customer',
        entityId: 'user-1',
        eventType: 'payment',
        timestampSeconds: now,
      });

      expect(result.loginThenPayment15m).toBe(false);
    });

    it('does NOT detect when current event is login (not payment)', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 1], [null, 'OK'], [null, 1],
        [null, [`login:${now}`]],
      ]);

      const result = await service.recordAndDetect({
        merchantId: 'merch-1',
        entityType: 'customer',
        entityId: 'user-1',
        eventType: 'login',
        timestampSeconds: now,
      });

      expect(result.loginThenPayment15m).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Sequence 2: 3× failed_payment → success within 10m
  // -----------------------------------------------------------------------

  describe('failedPaymentX3ThenSuccess10m', () => {
    it('detects 3 failed payments then success within 10 minutes', async () => {
      const t1 = now - 300;
      const t2 = now - 200;
      const t3 = now - 100;
      mockPipeline.exec.mockResolvedValue([
        [null, 1], [null, 'OK'], [null, 1],
        [null, [
          `payment:${now}`,
          `payment_failed:${t3}`,
          `payment_failed:${t2}`,
          `payment_failed:${t1}`,
        ]],
      ]);

      const result = await service.recordAndDetect({
        merchantId: 'merch-1',
        entityType: 'customer',
        entityId: 'user-1',
        eventType: 'payment',
        timestampSeconds: now,
      });

      expect(result.failedPaymentX3ThenSuccess10m).toBe(true);
    });

    it('does NOT detect with only 2 failed payments', async () => {
      const t1 = now - 200;
      const t2 = now - 100;
      mockPipeline.exec.mockResolvedValue([
        [null, 1], [null, 'OK'], [null, 1],
        [null, [
          `payment:${now}`,
          `payment_failed:${t2}`,
          `payment_failed:${t1}`,
        ]],
      ]);

      const result = await service.recordAndDetect({
        merchantId: 'merch-1',
        entityType: 'customer',
        entityId: 'user-1',
        eventType: 'payment',
        timestampSeconds: now,
      });

      expect(result.failedPaymentX3ThenSuccess10m).toBe(false);
    });

    it('does NOT detect if failed payments are older than 10 minutes', async () => {
      const old = now - 700; // > 10 min
      mockPipeline.exec.mockResolvedValue([
        [null, 1], [null, 'OK'], [null, 1],
        [null, [
          `payment:${now}`,
          `payment_failed:${old}`,
          `payment_failed:${old - 10}`,
          `payment_failed:${old - 20}`,
        ]],
      ]);

      const result = await service.recordAndDetect({
        merchantId: 'merch-1',
        entityType: 'customer',
        entityId: 'user-1',
        eventType: 'payment',
        timestampSeconds: now,
      });

      expect(result.failedPaymentX3ThenSuccess10m).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Sequence 3: device_change → payment within 30m
  // -----------------------------------------------------------------------

  describe('deviceChangeThenPayment30m', () => {
    it('detects device change followed by payment within 30 minutes', async () => {
      const changeTs = now - 1200; // 20 minutes ago
      mockPipeline.exec.mockResolvedValue([
        [null, 1], [null, 'OK'], [null, 1],
        [null, [`payment:${now}`, `device_change:${changeTs}`]],
      ]);

      const result = await service.recordAndDetect({
        merchantId: 'merch-1',
        entityType: 'customer',
        entityId: 'user-1',
        eventType: 'payment',
        timestampSeconds: now,
      });

      expect(result.deviceChangeThenPayment30m).toBe(true);
    });

    it('does NOT detect if device change was > 30m ago', async () => {
      const changeTs = now - 2000; // > 30 minutes
      mockPipeline.exec.mockResolvedValue([
        [null, 1], [null, 'OK'], [null, 1],
        [null, [`payment:${now}`, `device_change:${changeTs}`]],
      ]);

      const result = await service.recordAndDetect({
        merchantId: 'merch-1',
        entityType: 'customer',
        entityId: 'user-1',
        eventType: 'payment',
        timestampSeconds: now,
      });

      expect(result.deviceChangeThenPayment30m).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns all false for empty buffer', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 1], [null, 'OK'], [null, 1],
        [null, [`payment:${now}`]],
      ]);

      const result = await service.recordAndDetect({
        merchantId: 'merch-1',
        entityType: 'customer',
        entityId: 'user-1',
        eventType: 'payment',
        timestampSeconds: now,
      });

      expect(result.loginThenPayment15m).toBe(false);
      expect(result.failedPaymentX3ThenSuccess10m).toBe(false);
      expect(result.deviceChangeThenPayment30m).toBe(false);
    });

    it('returns all false for non-payment event', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 1], [null, 'OK'], [null, 1],
        [null, [`login:${now}`]],
      ]);

      const result = await service.recordAndDetect({
        merchantId: 'merch-1',
        entityType: 'customer',
        entityId: 'user-1',
        eventType: 'login',
        timestampSeconds: now,
      });

      expect(result.loginThenPayment15m).toBe(false);
      expect(result.failedPaymentX3ThenSuccess10m).toBe(false);
      expect(result.deviceChangeThenPayment30m).toBe(false);
    });

    it('uses correct Redis key format', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 1], [null, 'OK'], [null, 1],
        [null, []],
      ]);

      await service.recordAndDetect({
        merchantId: 'merch-1',
        entityType: 'customer',
        entityId: 'user-1',
        eventType: 'payment',
        timestampSeconds: now,
      });

      expect(mockPipeline.lpush).toHaveBeenCalledWith(
        'merch-1:vel:seq:customer:user-1',
        `payment:${now}`,
      );
      expect(mockPipeline.ltrim).toHaveBeenCalledWith(
        'merch-1:vel:seq:customer:user-1',
        0, 9,
      );
      expect(mockPipeline.expire).toHaveBeenCalledWith(
        'merch-1:vel:seq:customer:user-1',
        1800,
      );
    });
  });
});
