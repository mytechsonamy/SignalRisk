import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from '../events.service';
import { KafkaService, KafkaMessagePayload } from '../../kafka/kafka.service';
import { DlqService } from '../../dlq/dlq.service';
import { EventType } from '../dto/create-event.dto';

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

describe('EventsService', () => {
  let service: EventsService;
  let kafkaService: KafkaService;
  let dlqService: DlqService;

  const mockSendBatch = jest.fn().mockResolvedValue([]);
  const mockDlqSendBatch = jest.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    mockSendBatch.mockClear();
    mockDlqSendBatch.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: KafkaService,
          useValue: {
            sendBatch: mockSendBatch,
            send: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: DlqService,
          useValue: {
            sendToDlq: jest.fn().mockResolvedValue(undefined),
            sendBatchToDlq: mockDlqSendBatch,
          },
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    kafkaService = module.get<KafkaService>(KafkaService);
    dlqService = module.get<DlqService>(DlqService);
  });

  describe('ingest', () => {
    const validEvent = {
      merchantId: 'merchant-001',
      deviceId: 'device-abc',
      sessionId: 'session-xyz',
      type: EventType.PAGE_VIEW,
      payload: { url: 'https://example.com/home' },
    };

    it('should produce valid events to signalrisk.events.raw', async () => {
      const result = await service.ingest([validEvent]);

      expect(result.accepted).toBe(1);
      expect(result.rejected).toBe(0);
      expect(mockSendBatch).toHaveBeenCalledTimes(1);

      const sentPayloads: KafkaMessagePayload[] = mockSendBatch.mock.calls[0][0];
      expect(sentPayloads).toHaveLength(1);
      expect(sentPayloads[0].topic).toBe('signalrisk.events.raw');
    });

    it('should use session-salted partition key', async () => {
      await service.ingest([validEvent]);

      const sentPayloads: KafkaMessagePayload[] = mockSendBatch.mock.calls[0][0];
      expect(sentPayloads[0].key).toBe('merchant-001:session-xyz');
    });

    it('should set correct Kafka headers', async () => {
      await service.ingest([validEvent]);

      const sentPayloads: KafkaMessagePayload[] = mockSendBatch.mock.calls[0][0];
      const headers = sentPayloads[0].headers!;
      expect(headers['merchant-id']).toBe('merchant-001');
      expect(headers['event-type']).toBe('PAGE_VIEW');
      expect(headers['event-id']).toBeDefined();
      expect(headers['schema-version']).toBe('1');
    });

    it('should include all required fields in the produced message', async () => {
      await service.ingest([validEvent]);

      const sentPayloads: KafkaMessagePayload[] = mockSendBatch.mock.calls[0][0];
      const parsed = JSON.parse(sentPayloads[0].value);

      expect(parsed.eventId).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.source).toBe('event-collector');
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.merchantId).toBe('merchant-001');
      expect(parsed.deviceId).toBe('device-abc');
      expect(parsed.sessionId).toBe('session-xyz');
      expect(parsed.type).toBe('PAGE_VIEW');
      expect(parsed.payload).toEqual({ url: 'https://example.com/home' });
    });

    it('should handle multiple events in a batch', async () => {
      const events = [
        validEvent,
        {
          merchantId: 'merchant-002',
          deviceId: 'device-def',
          sessionId: 'session-abc',
          type: EventType.PAYMENT,
          payload: { amount: 1000, currency: 'USD', paymentMethod: 'credit_card' },
        },
      ];

      const result = await service.ingest(events);

      expect(result.accepted).toBe(2);
      expect(result.rejected).toBe(0);
      expect(result.results).toHaveLength(2);
    });

    it('should route invalid events to DLQ via DlqService', async () => {
      const invalidEvent = {
        merchantId: 'merchant-001',
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'INVALID_TYPE' as EventType,
        payload: { page: '/home' },
      };

      const result = await service.ingest([invalidEvent]);

      expect(result.rejected).toBe(1);
      expect(result.results[0].accepted).toBe(false);
      expect(result.results[0].error).toBeDefined();

      // DLQ batch should be called
      expect(mockDlqSendBatch).toHaveBeenCalledTimes(1);
      const dlqEnrichments = mockDlqSendBatch.mock.calls[0][0];
      expect(dlqEnrichments).toHaveLength(1);
      expect(dlqEnrichments[0].failureReason).toBe('validation-failed');
      expect(dlqEnrichments[0].retryCount).toBe(0);
    });

    it('should process mixed valid and invalid events', async () => {
      const events = [
        validEvent,
        {
          merchantId: 'merchant-001',
          deviceId: 'device-abc',
          sessionId: 'session-xyz',
          type: 'NOT_A_REAL_TYPE' as EventType,
          payload: { foo: 'bar' },
        },
      ];

      const result = await service.ingest(events);

      expect(result.accepted).toBe(1);
      expect(result.rejected).toBe(1);
      // Valid events to Kafka, invalid events to DLQ
      expect(mockSendBatch).toHaveBeenCalledTimes(1);
      expect(mockDlqSendBatch).toHaveBeenCalledTimes(1);
    });

    it('should use client-supplied eventId when provided', async () => {
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const eventWithId = {
        ...validEvent,
        eventId: customId,
      };

      await service.ingest([eventWithId]);

      const sentPayloads: KafkaMessagePayload[] = mockSendBatch.mock.calls[0][0];
      const parsed = JSON.parse(sentPayloads[0].value);
      expect(parsed.eventId).toBe(customId);
    });

    it('should throw when Kafka send fails for valid events', async () => {
      mockSendBatch.mockRejectedValueOnce(new Error('Kafka connection lost'));

      await expect(service.ingest([validEvent])).rejects.toThrow('Kafka connection lost');
    });

    it('should not throw when DLQ send fails (degrades gracefully)', async () => {
      const invalidEvent = {
        merchantId: 'merchant-001',
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: 'BAD_TYPE' as EventType,
        payload: { foo: 'bar' },
      };

      // DLQ send fails
      mockDlqSendBatch.mockRejectedValueOnce(new Error('DLQ send failed'));

      // Should not throw -- DLQ failures are logged but not propagated
      const result = await service.ingest([invalidEvent]);
      expect(result.rejected).toBe(1);
    });

    it('should include validationErrors in results for invalid events', async () => {
      const invalidEvent = {
        merchantId: 'merchant-001',
        deviceId: 'device-abc',
        sessionId: 'session-xyz',
        type: EventType.PAYMENT,
        payload: { amount: -50 }, // Missing currency and paymentMethod, negative amount
      };

      const result = await service.ingest([invalidEvent]);

      expect(result.rejected).toBe(1);
      expect(result.results[0].validationErrors).toBeDefined();
      expect(result.results[0].validationErrors!.length).toBeGreaterThan(0);
    });
  });
});
