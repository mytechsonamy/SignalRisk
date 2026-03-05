/**
 * Unit tests for DlqService
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DlqService, DlqEnrichment } from '../dlq.service';
import { KafkaService } from '../../kafka/kafka.service';

describe('DlqService', () => {
  let dlqService: DlqService;
  let kafkaService: jest.Mocked<KafkaService>;

  beforeEach(async () => {
    const mockKafkaService = {
      send: jest.fn().mockResolvedValue([]),
      sendBatch: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DlqService,
        { provide: KafkaService, useValue: mockKafkaService },
      ],
    }).compile();

    dlqService = module.get<DlqService>(DlqService);
    kafkaService = module.get(KafkaService);
  });

  // -------------------------------------------------------------------------
  // DLQ message enrichment
  // -------------------------------------------------------------------------

  describe('sendToDlq', () => {
    it('should send enriched message to DLQ topic', async () => {
      const enrichment: DlqEnrichment = {
        originalEvent: {
          merchantId: 'merchant-001',
          deviceId: 'device-abc',
          sessionId: 'session-xyz',
          type: 'PAYMENT',
          payload: { amount: -100 },
        },
        validationErrors: [
          {
            path: '/payload/amount',
            message: 'must be >= 0',
            keyword: 'minimum',
          },
        ],
        failureReason: 'validation-failed',
        retryCount: 0,
        originalTopic: 'http-ingestion',
      };

      await dlqService.sendToDlq(enrichment);

      expect(kafkaService.send).toHaveBeenCalledTimes(1);

      const payload = kafkaService.send.mock.calls[0][0];
      expect(payload.topic).toBe('signalrisk.events.dlq');
      expect(payload.key).toBe('merchant-001');

      // Verify the DLQ message body
      const body = JSON.parse(payload.value);
      expect(body.source).toBe('event-collector');
      expect(body.schemaVersion).toBe(1);
      expect(body.originalTopic).toBe('http-ingestion');
      expect(body.retryCount).toBe(0);
      expect(body.failureReason).toBe('validation-failed');
      expect(body.validationErrors).toHaveLength(1);
      expect(body.validationErrors[0].path).toBe('/payload/amount');
      expect(body.errorMessage).toContain('must be >= 0');

      // Verify original event is preserved
      const originalEvent = JSON.parse(body.originalValue);
      expect(originalEvent.merchantId).toBe('merchant-001');
    });

    it('should set correct Kafka headers', async () => {
      const enrichment: DlqEnrichment = {
        originalEvent: { merchantId: 'merchant-002' },
        validationErrors: [
          { path: '/', message: 'missing fields', keyword: 'required' },
        ],
        failureReason: 'validation-failed',
        retryCount: 2,
        originalTopic: 'signalrisk.events.raw',
      };

      await dlqService.sendToDlq(enrichment);

      const payload = kafkaService.send.mock.calls[0][0];
      expect(payload.headers).toBeDefined();
      expect(payload.headers!['dlq-reason']).toBe('validation-failed');
      expect(payload.headers!['original-topic']).toBe('signalrisk.events.raw');
      expect(payload.headers!['retry-count']).toBe('2');
      expect(payload.headers!['error-details']).toContain('missing fields');
      expect(payload.headers!['merchant-id']).toBe('merchant-002');
    });

    it('should use "unknown" merchantId when not present', async () => {
      const enrichment: DlqEnrichment = {
        originalEvent: { garbage: 'data' },
        validationErrors: [],
        failureReason: 'deserialization-error',
        retryCount: 0,
        originalTopic: 'http-ingestion',
      };

      await dlqService.sendToDlq(enrichment);

      const payload = kafkaService.send.mock.calls[0][0];
      expect(payload.key).toBe('unknown');
      expect(payload.headers!['merchant-id']).toBe('unknown');
    });

    it('should throw when Kafka send fails', async () => {
      kafkaService.send.mockRejectedValue(new Error('Kafka connection lost'));

      const enrichment: DlqEnrichment = {
        originalEvent: { merchantId: 'merchant-001' },
        validationErrors: [],
        failureReason: 'processing-error',
        retryCount: 1,
        originalTopic: 'signalrisk.events.raw',
      };

      await expect(dlqService.sendToDlq(enrichment)).rejects.toThrow(
        'Kafka connection lost',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Batch DLQ
  // -------------------------------------------------------------------------

  describe('sendBatchToDlq', () => {
    it('should send multiple enriched messages in a batch', async () => {
      const enrichments: DlqEnrichment[] = [
        {
          originalEvent: { merchantId: 'merchant-001' },
          validationErrors: [
            { path: '/type', message: 'invalid', keyword: 'enum' },
          ],
          failureReason: 'validation-failed',
          retryCount: 0,
          originalTopic: 'http-ingestion',
        },
        {
          originalEvent: { merchantId: 'merchant-002' },
          validationErrors: [],
          failureReason: 'processing-error',
          retryCount: 1,
          originalTopic: 'signalrisk.events.raw',
        },
      ];

      await dlqService.sendBatchToDlq(enrichments);

      expect(kafkaService.sendBatch).toHaveBeenCalledTimes(1);
      const payloads = kafkaService.sendBatch.mock.calls[0][0];
      expect(payloads).toHaveLength(2);
      expect(payloads[0].topic).toBe('signalrisk.events.dlq');
      expect(payloads[1].topic).toBe('signalrisk.events.dlq');
    });

    it('should throw when batch Kafka send fails', async () => {
      kafkaService.sendBatch.mockRejectedValue(
        new Error('Batch send failed'),
      );

      await expect(
        dlqService.sendBatchToDlq([
          {
            originalEvent: {},
            validationErrors: [],
            failureReason: 'unknown',
            retryCount: 0,
            originalTopic: 'test',
          },
        ]),
      ).rejects.toThrow('Batch send failed');
    });
  });
});
