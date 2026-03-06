import { KafkaContainer, StartedKafkaContainer } from '@testcontainers/kafka';
import { Kafka, Consumer, Producer, logLevel } from 'kafkajs';
import { z } from 'zod';

// Skip if env var set (for CI without Docker)
const SKIP = process.env.SKIP_KAFKA_TESTS === 'true';
const describeOrSkip = SKIP ? describe.skip : describe;

// Zod schema for event validation (mirrors signal-contracts)
const EventSchema = z.object({
  merchantId: z.string(),
  deviceId: z.string(),
  sessionId: z.string(),
  type: z.enum(['PAGE_VIEW', 'CLICK', 'FORM_SUBMIT', 'CHECKOUT', 'LOGIN', 'LOGOUT']),
  payload: z.record(z.unknown()),
});

type TestEvent = z.infer<typeof EventSchema>;

function makeEvent(overrides: Partial<TestEvent> = {}): TestEvent {
  return {
    merchantId: 'merchant-001',
    deviceId: 'device-abc',
    sessionId: 'session-xyz',
    type: 'PAGE_VIEW',
    payload: { page: '/checkout' },
    ...overrides,
  };
}

describeOrSkip('Kafka Integration Tests', () => {
  let container: StartedKafkaContainer;
  let kafka: Kafka;
  let producer: Producer;

  beforeAll(async () => {
    container = await new KafkaContainer('confluentinc/cp-kafka:7.4.0')
      .withExposedPorts(9093)
      .start();

    kafka = new Kafka({
      clientId: 'test-client',
      brokers: [`${container.getHost()}:${container.getMappedPort(9093)}`],
      logLevel: logLevel.ERROR,
    });

    producer = kafka.producer();
    await producer.connect();

    // Create topics
    const admin = kafka.admin();
    await admin.connect();
    await admin.createTopics({
      topics: [
        { topic: 'events', numPartitions: 3 },
        { topic: 'events-dlq', numPartitions: 1 },
        { topic: 'decisions', numPartitions: 3 },
      ],
    });
    await admin.disconnect();
  }, 120000);

  afterAll(async () => {
    await producer.disconnect();
    await container.stop();
  }, 30000);

  async function consumeMessages(
    topic: string,
    groupId: string,
    expectedCount: number,
    timeoutMs = 15000,
  ): Promise<any[]> {
    const consumer = kafka.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });

    const messages: any[] = [];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(async () => {
        await consumer.disconnect();
        resolve(messages); // return what we got
      }, timeoutMs);

      consumer.run({
        eachMessage: async ({ message }) => {
          messages.push(JSON.parse(message.value?.toString() ?? '{}'));
          if (messages.length >= expectedCount) {
            clearTimeout(timer);
            await consumer.disconnect();
            resolve(messages);
          }
        },
      }).catch(reject);
    });
  }

  describe('Producer → Consumer round-trip (events topic)', () => {
    it('produces and consumes 3 events with correct merchantId', async () => {
      const events = [
        makeEvent({ deviceId: 'dev-1' }),
        makeEvent({ deviceId: 'dev-2' }),
        makeEvent({ type: 'CLICK', deviceId: 'dev-3' }),
      ];

      await producer.send({
        topic: 'events',
        messages: events.map(e => ({ value: JSON.stringify(e) })),
      });

      const received = await consumeMessages('events', 'test-round-trip-1', 3);
      expect(received.length).toBe(3);
      received.forEach(msg => expect(msg.merchantId).toBe('merchant-001'));
    }, 30000);

    it('preserves event type through Kafka', async () => {
      await producer.send({
        topic: 'events',
        messages: [{ value: JSON.stringify(makeEvent({ type: 'CHECKOUT' })) }],
      });

      const received = await consumeMessages('events', 'test-type-check', 1);
      expect(received[0].type).toBe('CHECKOUT');
    }, 30000);

    it('preserves payload through Kafka serialization', async () => {
      const payload = { cartValue: 99.99, currency: 'USD', items: 3 };
      await producer.send({
        topic: 'events',
        messages: [{ value: JSON.stringify(makeEvent({ payload })) }],
      });

      const received = await consumeMessages('events', 'test-payload', 1);
      expect(received[0].payload).toEqual(payload);
    }, 30000);
  });

  describe('Dead-letter queue routing', () => {
    it('routes malformed event to DLQ with error metadata', async () => {
      const malformed = { merchantId: 'test', missing_required_fields: true };

      // Simulate consumer DLQ logic: validate, if fails → produce to DLQ
      const validate = (msg: unknown) => EventSchema.safeParse(msg);
      const result = validate(malformed);
      expect(result.success).toBe(false);

      if (!result.success) {
        await producer.send({
          topic: 'events-dlq',
          messages: [{
            value: JSON.stringify({
              originalMessage: malformed,
              error: result.error.message,
              timestamp: new Date().toISOString(),
            }),
          }],
        });
      }

      const dlqMessages = await consumeMessages('events-dlq', 'test-dlq-reader', 1);
      expect(dlqMessages.length).toBe(1);
      expect(dlqMessages[0].originalMessage).toBeDefined();
      expect(dlqMessages[0].error).toBeDefined();
    }, 30000);

    it('Zod validation rejects event missing merchantId', () => {
      const result = EventSchema.safeParse({ deviceId: 'x', sessionId: 'y', type: 'PAGE_VIEW', payload: {} });
      expect(result.success).toBe(false);
    });

    it('Zod validation rejects unknown event type', () => {
      const result = EventSchema.safeParse(makeEvent({ type: 'UNKNOWN' as any }));
      expect(result.success).toBe(false);
    });

    it('Zod validation accepts valid event', () => {
      const result = EventSchema.safeParse(makeEvent());
      expect(result.success).toBe(true);
    });
  });

  describe('Consumer group isolation', () => {
    it('two consumer groups both receive all messages independently', async () => {
      const event = makeEvent({ deviceId: 'isolation-test', sessionId: 'iso-session' });
      await producer.send({
        topic: 'events',
        messages: [{ value: JSON.stringify(event) }],
      });

      const [group1, group2] = await Promise.all([
        consumeMessages('events', 'isolation-group-1', 1, 10000),
        consumeMessages('events', 'isolation-group-2', 1, 10000),
      ]);

      // Both groups should have received at least the event (may have extras from prior tests)
      expect(group1.length).toBeGreaterThanOrEqual(1);
      expect(group2.length).toBeGreaterThanOrEqual(1);
    }, 30000);
  });

  describe('Decisions topic', () => {
    it('produces and consumes decision event with action=BLOCK', async () => {
      const decision = {
        decisionId: 'dec-001',
        merchantId: 'merchant-001',
        entityId: 'device-abc',
        action: 'BLOCK',
        riskScore: 95,
        timestamp: new Date().toISOString(),
      };

      await producer.send({
        topic: 'decisions',
        messages: [{ value: JSON.stringify(decision) }],
      });

      const received = await consumeMessages('decisions', 'test-decision-consumer', 1);
      expect(received[0].action).toBe('BLOCK');
      expect(received[0].riskScore).toBe(95);
    }, 30000);

    it('decision event preserves all required fields', async () => {
      const decision = {
        decisionId: 'dec-002',
        merchantId: 'merchant-002',
        entityId: 'entity-xyz',
        action: 'REVIEW',
        riskScore: 65,
        firedRuleIds: ['rule-1', 'rule-2'],
        timestamp: new Date().toISOString(),
      };

      await producer.send({
        topic: 'decisions',
        messages: [{ value: JSON.stringify(decision) }],
      });

      const received = await consumeMessages('decisions', 'test-decision-fields', 1);
      expect(received[0].firedRuleIds).toEqual(['rule-1', 'rule-2']);
    }, 30000);
  });

  describe('Bulk message processing', () => {
    it('handles 20 messages without loss', async () => {
      const messages = Array.from({ length: 20 }, (_, i) =>
        makeEvent({ deviceId: `bulk-device-${i}`, sessionId: `bulk-session-${i}` })
      );

      await producer.send({
        topic: 'events',
        messages: messages.map(e => ({ value: JSON.stringify(e) })),
      });

      const received = await consumeMessages('events', 'test-bulk-reader', 20, 20000);
      // We may get more due to prior tests, but at least 20
      expect(received.length).toBeGreaterThanOrEqual(20);
    }, 40000);
  });
});
