/**
 * Unit tests for DlqConsumerService — 6 required cases for Sprint 9 T3
 *
 * Tests:
 * 1. retryCount < maxRetries → reprocessEvent called → event published to signalrisk.events.raw
 * 2. retryCount === maxRetries → exhaustRetries called → event published to signalrisk.events.dlq.exhausted
 * 3. retryCount === maxRetries → signalrisk.events.raw NOT called
 * 4. Re-published event has dlq-retry-count header = retryCount + 1 (reprocess case)
 * 5. Invalid JSON originalValue → throws error (caught and handled)
 * 6. Exhausted events logged at WARN level
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DlqConsumerService, DlqRecord } from '../dlq-consumer.service';
import { KafkaService } from '../../kafka/kafka.service';

describe('DlqConsumerService — Sprint 9 T3 (6 required tests)', () => {
  let consumer: DlqConsumerService;
  let kafkaService: jest.Mocked<Pick<KafkaService, 'sendBatch'>>;
  let mockSendBatch: jest.Mock;

  const TOPIC_RAW = 'signalrisk.events.raw';
  const TOPIC_EXHAUSTED = 'signalrisk.events.dlq.exhausted';
  const MAX_RETRIES = 3;

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
    mockSendBatch = jest.fn().mockResolvedValue([]);

    const mockKafkaService = {
      sendBatch: mockSendBatch,
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'dlq.maxRetries') return MAX_RETRIES;
        if (key === 'dlq.baseDelayMs') return 1; // 1ms for fast tests
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DlqConsumerService,
        { provide: KafkaService, useValue: mockKafkaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    consumer = module.get<DlqConsumerService>(DlqConsumerService);
    kafkaService = module.get(KafkaService) as jest.Mocked<Pick<KafkaService, 'sendBatch'>>;
    await consumer.onModuleInit();
  });

  afterEach(async () => {
    await consumer.onModuleDestroy();
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Test 1: retryCount < maxRetries → reprocessEvent called → published to raw topic
  // ---------------------------------------------------------------------------

  it('1. retryCount < maxRetries → event is republished to signalrisk.events.raw', async () => {
    const record = createDlqRecord({ eventId: 'evt-retry', retryCount: 0 });

    const outcome = await consumer.processRecord(record);

    expect(outcome).toBe('retried');

    // Find the call that targeted signalrisk.events.raw
    const rawCall = mockSendBatch.mock.calls.find(
      (call) => call[0][0].topic === TOPIC_RAW,
    );
    expect(rawCall).toBeDefined();
    expect(rawCall![0][0].topic).toBe(TOPIC_RAW);
  });

  // ---------------------------------------------------------------------------
  // Test 2: retryCount === maxRetries → event published to signalrisk.events.dlq.exhausted
  // ---------------------------------------------------------------------------

  it('2. retryCount === maxRetries → event published to signalrisk.events.dlq.exhausted', async () => {
    const record = createDlqRecord({ eventId: 'evt-exhausted', retryCount: MAX_RETRIES });

    const outcome = await consumer.processRecord(record);

    expect(outcome).toBe('exhausted');

    const exhaustedCall = mockSendBatch.mock.calls.find(
      (call) => call[0][0].topic === TOPIC_EXHAUSTED,
    );
    expect(exhaustedCall).toBeDefined();
    expect(exhaustedCall![0][0].topic).toBe(TOPIC_EXHAUSTED);
    expect(exhaustedCall![0][0].headers['dlq-final-retry-count']).toBe(String(MAX_RETRIES));
  });

  // ---------------------------------------------------------------------------
  // Test 3: retryCount === maxRetries → signalrisk.events.raw NOT called
  // ---------------------------------------------------------------------------

  it('3. retryCount === maxRetries → signalrisk.events.raw is NOT called', async () => {
    const record = createDlqRecord({ eventId: 'evt-no-raw', retryCount: MAX_RETRIES });

    await consumer.processRecord(record);

    const rawCall = mockSendBatch.mock.calls.find(
      (call) => call[0][0].topic === TOPIC_RAW,
    );
    expect(rawCall).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test 4: Re-published event has dlq-retry-count header = retryCount + 1
  // ---------------------------------------------------------------------------

  it('4. re-published event has dlq-retry-count header equal to retryCount + 1', async () => {
    const retryCount = 1;
    const record = createDlqRecord({ eventId: 'evt-header-check', retryCount });

    const outcome = await consumer.processRecord(record);

    expect(outcome).toBe('retried');

    const rawCall = mockSendBatch.mock.calls.find(
      (call) => call[0][0].topic === TOPIC_RAW,
    );
    expect(rawCall).toBeDefined();

    const publishedMessage = rawCall![0][0];
    expect(publishedMessage.headers['dlq-retry-count']).toBe(String(retryCount + 1));
  });

  // ---------------------------------------------------------------------------
  // Test 5: Invalid JSON originalValue → parse error is caught and handled
  // ---------------------------------------------------------------------------

  it('5. invalid JSON originalValue → parse error is caught (does not throw unhandled)', async () => {
    const record = createDlqRecord({
      eventId: 'evt-bad-json',
      originalValue: 'not-valid-json{{{',
      retryCount: 0,
    });

    // The service internally catches the JSON.parse error.
    // retryCount=0, after failure retryCount+1=1 < maxRetries=3 → still 'retried'
    await expect(consumer.processRecord(record)).resolves.toBeDefined();

    // The raw topic must NOT have been successfully published (JSON.parse threw)
    const rawCall = mockSendBatch.mock.calls.find(
      (call) => call[0][0].topic === TOPIC_RAW,
    );
    expect(rawCall).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test 6: Exhausted events are logged at WARN level
  // ---------------------------------------------------------------------------

  it('6. exhausted events are logged at WARN level with event ID, original topic, and retry count', async () => {
    // Access the private logger via bracket notation for spying
    const logger = (consumer as unknown as { logger: { warn: jest.Mock } }).logger;
    const warnSpy = jest.spyOn(logger, 'warn');

    const record = createDlqRecord({
      eventId: 'evt-warn-check',
      originalTopic: 'signalrisk.events.raw',
      retryCount: MAX_RETRIES,
    });

    await consumer.processRecord(record);

    expect(warnSpy).toHaveBeenCalled();

    // The warn message must reference the event ID and retry count
    const warnMessage: string = warnSpy.mock.calls[0][0];
    expect(warnMessage).toContain('evt-warn-check');
    expect(warnMessage).toContain(String(MAX_RETRIES));
  });
});
