# Skill: kafka-event-pipeline

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | BACKEND_NODE |
| **Category** | backend |

## Description
Kafka event pipeline for SignalRisk's event-driven architecture. Covers producers (event collector, outbox relay), consumers (intelligence services), and operational patterns (backpressure, dead letter, idempotency).

## Patterns
- Event Collector: HTTP -> validate -> Kafka produce (with backpressure control)
- Outbox Relay: Poll outbox_events table -> Kafka produce -> mark published
- All consumers are idempotent (dedup via event_id in processed_events table)
- Dead letter queue for invalid/failed events
- Session-salted partition keys to avoid hot spots
- 48 partitions per topic from day 1
- JSON Schema validation on event ingestion

## Architecture Reference
architecture-v3.md#2.2-service-interaction-flow

## Code Examples
```typescript
// Kafka producer (event collector)
@Injectable()
export class EventProducerService {
  constructor(private readonly kafka: KafkaService) {}

  async publishEvent(event: ValidatedEvent): Promise<void> {
    const partitionKey = `${event.merchantId}:${event.sessionId}`;
    await this.kafka.produce({
      topic: 'signalrisk.events.raw',
      key: partitionKey,
      value: JSON.stringify(event),
      headers: {
        'event-id': event.eventId,
        'merchant-id': event.merchantId,
        'event-type': event.type,
      },
    });
  }
}

// Idempotent consumer
@Injectable()
export class DeviceEventConsumer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceService: DeviceIntelService,
  ) {}

  @KafkaConsumer({ topic: 'signalrisk.events.raw', groupId: 'device-intel' })
  async handleEvent(message: KafkaMessage): Promise<void> {
    const eventId = message.headers['event-id'];

    // Idempotency check
    const exists = await this.prisma.processedEvent.findUnique({
      where: { eventId_consumerGroup: { eventId, consumerGroup: 'device-intel' } },
    });
    if (exists) return; // Already processed

    // Process event
    await this.deviceService.processDeviceEvent(JSON.parse(message.value));

    // Mark as processed
    await this.prisma.processedEvent.create({
      data: { eventId, consumerGroup: 'device-intel' },
    });
  }
}

// Backpressure: 429 when lag exceeds threshold
@Injectable()
export class BackpressureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const lag = this.kafka.getConsumerLag('signalrisk.events.raw');
    if (lag > BACKPRESSURE_THRESHOLD) {
      throw new HttpException('Too Many Requests', 429);
    }
    return true;
  }
}
```

## Constraints
- Every consumer MUST check processed_events before processing (idempotency)
- Use session-salted partition keys: `${merchantId}:${sessionId}` (not just merchantId)
- Dead letter topic: `signalrisk.events.dlq` for failed events after 3 retries
- Backpressure: return 429 when consumer lag exceeds threshold
- JSON Schema validation on ALL incoming events (reject invalid to DLQ)
- Never produce to Kafka outside a transaction -- use transactional outbox for DB+Kafka atomicity
