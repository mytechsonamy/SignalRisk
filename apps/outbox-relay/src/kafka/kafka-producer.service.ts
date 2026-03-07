import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Message } from 'kafkajs';

export interface OutboxMessage {
  topic: string;
  key: string;
  value: string;
  headers: Record<string, string>;
}

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;

  constructor(private readonly config: ConfigService) {
    this.kafka = new Kafka({
      clientId: this.config.get<string>('kafka.clientId'),
      brokers: this.config.get<string[]>('kafka.brokers') ?? ['localhost:9092'],
    });

    this.producer = this.kafka.producer({
      idempotent: true,
      maxInFlightRequests: 1,
      transactionalId: undefined, // idempotent without transactions
    });
  }

  async onModuleInit(): Promise<void> {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.producer.connect();
        this.logger.log('Kafka producer connected (idempotent=true)');
        return;
      } catch (error) {
        this.logger.warn(`Kafka connection attempt ${attempt}/5 failed: ${(error as Error).message}`);
        if (attempt === 5) {
          this.logger.error('Kafka connection failed after all retries — running in degraded mode');
          return;
        }
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected');
  }

  /**
   * Send a batch of outbox messages grouped by topic.
   * Uses KafkaJS batch sending for throughput.
   */
  async sendBatch(messages: OutboxMessage[]): Promise<void> {
    if (messages.length === 0) return;

    // Group messages by topic for batch send
    const byTopic = new Map<string, Message[]>();
    for (const msg of messages) {
      const existing = byTopic.get(msg.topic) ?? [];
      existing.push({
        key: msg.key,
        value: msg.value,
        headers: msg.headers,
      });
      byTopic.set(msg.topic, existing);
    }

    const topicMessages = Array.from(byTopic.entries()).map(
      ([topic, msgs]) => ({
        topic,
        messages: msgs,
      }),
    );

    await this.producer.sendBatch({ topicMessages });

    this.logger.debug(
      `Sent ${messages.length} messages across ${topicMessages.length} topic(s)`,
    );
  }
}
