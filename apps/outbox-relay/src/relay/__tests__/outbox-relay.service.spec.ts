import { OutboxRelayService } from '../outbox-relay.service';
import { KafkaProducerService } from '../../kafka/kafka-producer.service';
import { DedupService } from '../dedup.service';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

describe('OutboxRelayService', () => {
  let service: OutboxRelayService;
  let mockPool: jest.Mocked<Pool>;
  let mockKafkaProducer: jest.Mocked<KafkaProducerService>;
  let mockDedupService: jest.Mocked<DedupService>;
  let mockConfig: jest.Mocked<ConfigService>;

  const sampleRows = [
    {
      id: 'aaa-111',
      aggregate_type: 'DECISION',
      aggregate_id: 'dec-001',
      event_type: 'created',
      payload: { riskScore: 85.5 },
      created_at: new Date('2026-03-05T10:00:00Z'),
    },
    {
      id: 'bbb-222',
      aggregate_type: 'DEVICE',
      aggregate_id: 'dev-002',
      event_type: 'updated',
      payload: { trustScore: 42.0 },
      created_at: new Date('2026-03-05T10:00:01Z'),
    },
  ];

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    } as unknown as jest.Mocked<Pool>;

    mockKafkaProducer = {
      sendBatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<KafkaProducerService>;

    mockDedupService = {
      buildKafkaKey: jest.fn((id: string) => id),
      updateWatermark: jest.fn(),
    } as unknown as jest.Mocked<DedupService>;

    mockConfig = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'relay.pollIntervalMs': 500,
          'relay.batchSize': 100,
        };
        return values[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new OutboxRelayService(
      mockPool,
      mockKafkaProducer,
      mockDedupService,
      mockConfig,
    );
  });

  describe('pollOnce', () => {
    it('fetches unpublished events and sends them to Kafka', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: sampleRows } as never) // SELECT
        .mockResolvedValueOnce({ rowCount: 2 } as never); // UPDATE

      const count = await service.pollOnce();

      expect(count).toBe(2);

      // Verify SELECT query
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE published_at IS NULL'),
        [100],
      );

      // Verify Kafka sendBatch was called with correct messages
      expect(mockKafkaProducer.sendBatch).toHaveBeenCalledTimes(1);
      const messages = mockKafkaProducer.sendBatch.mock.calls[0][0];
      expect(messages).toHaveLength(2);
      expect(messages[0].topic).toBe('signalrisk.decisions');
      expect(messages[0].key).toBe('aaa-111');
      expect(messages[0].headers['outbox-event-id']).toBe('aaa-111');
      expect(messages[0].headers['aggregate-type']).toBe('DECISION');
      expect(messages[0].headers['event-type']).toBe('created');
      expect(messages[1].topic).toBe('signalrisk.events.raw');
      expect(messages[1].key).toBe('bbb-222');

      // Verify UPDATE to mark published
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SET published_at = NOW()'),
        [['aaa-111', 'bbb-222']],
      );

      // Verify watermark updated
      expect(mockDedupService.updateWatermark).toHaveBeenCalledTimes(1);
    });

    it('returns 0 when no unpublished events exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] } as never);

      const count = await service.pollOnce();

      expect(count).toBe(0);
      expect(mockKafkaProducer.sendBatch).not.toHaveBeenCalled();
    });

    it('returns 0 and logs error when query fails', async () => {
      (mockPool.query as jest.Mock).mockRejectedValueOnce(new Error('connection lost'));

      const count = await service.pollOnce();

      expect(count).toBe(0);
      expect(mockKafkaProducer.sendBatch).not.toHaveBeenCalled();
    });

    it('does not mark events as published if Kafka send fails', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: sampleRows } as never);
      mockKafkaProducer.sendBatch.mockRejectedValueOnce(
        new Error('broker unavailable'),
      );

      const count = await service.pollOnce();

      expect(count).toBe(0);
      // Only the SELECT query should have been called, not the UPDATE
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('includes correct payload in Kafka message value', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [sampleRows[0]] } as never)
        .mockResolvedValueOnce({ rowCount: 1 } as never);

      await service.pollOnce();

      const messages = mockKafkaProducer.sendBatch.mock.calls[0][0];
      const parsed = JSON.parse(messages[0].value);
      expect(parsed.id).toBe('aaa-111');
      expect(parsed.aggregateType).toBe('DECISION');
      expect(parsed.aggregateId).toBe('dec-001');
      expect(parsed.eventType).toBe('created');
      expect(parsed.payload).toEqual({ riskScore: 85.5 });
      expect(parsed.createdAt).toBe('2026-03-05T10:00:00.000Z');
    });
  });

  describe('health metrics', () => {
    it('tracks last poll time', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] } as never);

      expect(service.lastPollTime).toBeNull();
      await service.pollOnce();
      expect(service.lastPollTime).toBeInstanceOf(Date);
    });

    it('tracks total events published', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: sampleRows } as never)
        .mockResolvedValueOnce({ rowCount: 2 } as never);

      expect(service.eventsPublished).toBe(0);
      await service.pollOnce();
      expect(service.eventsPublished).toBe(2);
    });

    it('reports lag as count of unpublished events', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ count: '42' }],
      } as never);

      const lag = await service.getLag();
      expect(lag).toBe(42);
    });
  });
});
