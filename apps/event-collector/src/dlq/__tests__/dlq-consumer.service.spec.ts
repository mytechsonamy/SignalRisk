/**
 * Unit tests for DlqConsumerService
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DlqConsumerService, DlqRecord } from '../dlq-consumer.service';

describe('DlqConsumerService', () => {
  let consumer: DlqConsumerService;

  const createDlqRecord = (overrides: Partial<DlqRecord> = {}): DlqRecord => ({
    eventId: 'evt-001',
    timestamp: '2025-01-15T10:00:00Z',
    source: 'event-collector',
    schemaVersion: 1,
    originalTopic: 'signalrisk.events.raw',
    originalPartition: 0,
    originalOffset: 42,
    originalValue: JSON.stringify({
      merchantId: 'merchant-001',
      deviceId: 'device-abc',
      sessionId: 'session-xyz',
      type: 'PAYMENT',
      payload: { amount: 1000, currency: 'USD', paymentMethod: 'credit_card' },
    }),
    errorMessage: 'Validation failed',
    validationErrors: [
      { path: '/payload/amount', message: 'must be >= 0', keyword: 'minimum' },
    ],
    failureReason: 'validation-failed',
    retryCount: 0,
    ...overrides,
  });

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'dlq.maxRetries') return 3;
        if (key === 'dlq.baseDelayMs') return 10; // Fast for tests
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DlqConsumerService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    consumer = module.get<DlqConsumerService>(DlqConsumerService);
    await consumer.onModuleInit();
  });

  afterEach(async () => {
    await consumer.onModuleDestroy();
  });

  // -------------------------------------------------------------------------
  // Retry logic with exponential backoff
  // -------------------------------------------------------------------------

  describe('retry logic', () => {
    it('should retry events with retryCount < maxRetries', async () => {
      const record = createDlqRecord({ retryCount: 0 });
      const outcome = await consumer.processRecord(record);
      expect(outcome).toBe('retried');
    });

    it('should retry events at retryCount 1', async () => {
      const record = createDlqRecord({
        eventId: 'evt-retry-1',
        retryCount: 1,
      });
      const outcome = await consumer.processRecord(record);
      expect(outcome).toBe('retried');
    });

    it('should retry events at retryCount 2 (last chance)', async () => {
      const record = createDlqRecord({
        eventId: 'evt-retry-2',
        retryCount: 2,
      });
      const outcome = await consumer.processRecord(record);
      expect(outcome).toBe('retried');
    });
  });

  // -------------------------------------------------------------------------
  // Max retry exhaustion
  // -------------------------------------------------------------------------

  describe('max retry exhaustion', () => {
    it('should exhaust events at retryCount >= maxRetries', async () => {
      const record = createDlqRecord({
        eventId: 'evt-exhausted',
        retryCount: 3,
      });
      const outcome = await consumer.processRecord(record);
      expect(outcome).toBe('exhausted');
    });

    it('should exhaust events with retryCount exceeding maxRetries', async () => {
      const record = createDlqRecord({
        eventId: 'evt-over-exhausted',
        retryCount: 5,
      });
      const outcome = await consumer.processRecord(record);
      expect(outcome).toBe('exhausted');
    });

    it('should store exhausted events in permanent DLQ', async () => {
      const record = createDlqRecord({
        eventId: 'evt-permanent',
        retryCount: 3,
      });
      await consumer.processRecord(record);

      const permanentRecords = consumer.getPermanentDlqRecords();
      expect(permanentRecords).toHaveLength(1);
      expect(permanentRecords[0].eventId).toBe('evt-permanent');
    });
  });

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------

  describe('idempotency', () => {
    it('should skip already-processed events', async () => {
      const record = createDlqRecord({ eventId: 'evt-idempotent' });

      const first = await consumer.processRecord(record);
      expect(first).toBe('retried');

      const second = await consumer.processRecord(record);
      expect(second).toBe('skipped');
    });

    it('should track processed event count', async () => {
      const record1 = createDlqRecord({ eventId: 'evt-count-1' });
      const record2 = createDlqRecord({ eventId: 'evt-count-2' });

      await consumer.processRecord(record1);
      await consumer.processRecord(record2);

      expect(consumer.getProcessedCount()).toBe(2);
    });

    it('should report processed status correctly', async () => {
      const record = createDlqRecord({ eventId: 'evt-check' });
      expect(consumer.isProcessed('evt-check')).toBe(false);

      await consumer.processRecord(record);
      expect(consumer.isProcessed('evt-check')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Exponential backoff calculation
  // -------------------------------------------------------------------------

  describe('calculateBackoff', () => {
    it('should increase delay exponentially', () => {
      // Base delay is 10ms in test config
      const delay0 = consumer.calculateBackoff(0);
      const delay1 = consumer.calculateBackoff(1);
      const delay2 = consumer.calculateBackoff(2);

      // Each delay should roughly double (with some jitter)
      // delay0: ~10ms, delay1: ~20ms, delay2: ~40ms
      expect(delay0).toBeGreaterThanOrEqual(10);
      expect(delay0).toBeLessThan(20);
      expect(delay1).toBeGreaterThanOrEqual(20);
      expect(delay1).toBeLessThan(30);
      expect(delay2).toBeGreaterThanOrEqual(40);
      expect(delay2).toBeLessThan(50);
    });

    it('should cap at 30 seconds', () => {
      const delay = consumer.calculateBackoff(20); // 2^20 * baseDelay
      expect(delay).toBeLessThanOrEqual(30_000);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle record with invalid originalValue JSON', async () => {
      const record = createDlqRecord({
        eventId: 'evt-bad-json',
        originalValue: 'not valid json{{{',
        retryCount: 0,
      });

      // Should not throw — handles the parse error internally
      // The retry will fail but the record will be tracked
      const outcome = await consumer.processRecord(record);
      // SyntaxError on JSON.parse leads to retry failure, but since
      // retryCount + 1 < maxRetries, it still counts as 'retried'
      expect(['retried', 'exhausted']).toContain(outcome);
    });

    it('should handle multiple exhausted events in permanent DLQ', async () => {
      for (let i = 0; i < 5; i++) {
        await consumer.processRecord(
          createDlqRecord({
            eventId: `evt-perm-${i}`,
            retryCount: 3,
          }),
        );
      }

      expect(consumer.getPermanentDlqRecords()).toHaveLength(5);
    });
  });
});
