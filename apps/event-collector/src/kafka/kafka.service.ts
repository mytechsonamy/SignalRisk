/**
 * SignalRisk Event Collector — Kafka Producer Service
 *
 * Manages a KafkaJS idempotent producer with batched sending,
 * connection lifecycle, and retry/error handling.
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Kafka,
  Producer,
  CompressionTypes,
  ProducerRecord,
  RecordMetadata,
  Admin,
  logLevel,
} from 'kafkajs';

export interface KafkaMessagePayload {
  topic: string;
  key: string;
  value: string;
  headers?: Record<string, string>;
}

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka;
  private producer: Producer;
  private admin: Admin;
  private connected = false;
  private consumerLag = 0;

  constructor(private readonly configService: ConfigService) {
    const brokers = this.configService.get<string[]>('kafka.brokers') || ['localhost:9092'];
    const clientId = this.configService.get<string>('kafka.clientId') || 'event-collector';
    const ssl = this.configService.get<boolean>('kafka.ssl') || false;

    const kafkaConfig: ConstructorParameters<typeof Kafka>[0] = {
      clientId,
      brokers,
      ssl,
      logLevel: logLevel.ERROR,
      retry: {
        initialRetryTime: 300,
        retries: 10,
        maxRetryTime: 30_000,
        factor: 2,
      },
      connectionTimeout: 10_000,
      requestTimeout: 30_000,
    };

    // SASL auth (optional)
    const saslMechanism = this.configService.get<string>('kafka.saslMechanism');
    if (saslMechanism) {
      kafkaConfig.sasl = {
        mechanism: saslMechanism as any,
        username: this.configService.get<string>('kafka.saslUsername') || '',
        password: this.configService.get<string>('kafka.saslPassword') || '',
      };
    }

    this.kafka = new Kafka(kafkaConfig);

    // Idempotent producer for exactly-once semantics
    this.producer = this.kafka.producer({
      idempotent: true,
      maxInFlightRequests: 5,
      allowAutoTopicCreation: false,
    });

    this.admin = this.kafka.admin();
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
    this.startLagPolling();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  async connect(retries = 5, delayMs = 3000): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.producer.connect();
        await this.admin.connect();
        this.connected = true;
        this.logger.log('Kafka producer connected');
        return;
      } catch (error) {
        this.logger.warn(`Kafka connection attempt ${attempt}/${retries} failed: ${(error as Error).message}`);
        if (attempt === retries) {
          this.logger.error('Kafka connection failed after all retries — running in degraded mode');
          return;
        }
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.producer.disconnect();
      await this.admin.disconnect();
      this.connected = false;
      this.logger.log('Kafka producer disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting Kafka producer', (error as Error).stack);
    }
  }

  /**
   * Send a single message to a Kafka topic.
   */
  async send(payload: KafkaMessagePayload): Promise<RecordMetadata[]> {
    return this.sendBatch([payload]);
  }

  /**
   * Send a batch of messages. Groups by topic for efficient batching.
   */
  async sendBatch(payloads: KafkaMessagePayload[]): Promise<RecordMetadata[]> {
    if (!this.connected) {
      throw new Error('Kafka producer is not connected');
    }

    const compression = this.resolveCompression();

    // Group messages by topic
    const topicMap = new Map<string, { key: string; value: string; headers?: Record<string, string> }[]>();
    for (const p of payloads) {
      const existing = topicMap.get(p.topic) || [];
      existing.push({ key: p.key, value: p.value, headers: p.headers });
      topicMap.set(p.topic, existing);
    }

    const allMetadata: RecordMetadata[] = [];

    for (const [topic, messages] of topicMap) {
      const record: ProducerRecord = {
        topic,
        compression,
        messages: messages.map((m) => ({
          key: m.key,
          value: m.value,
          headers: m.headers,
        })),
      };

      try {
        const metadata = await this.producer.send(record);
        allMetadata.push(...metadata);
      } catch (error) {
        this.logger.error(
          `Failed to send batch to topic ${topic}: ${(error as Error).message}`,
          (error as Error).stack,
        );
        throw error;
      }
    }

    return allMetadata;
  }

  /**
   * Returns the current estimated consumer lag.
   * Used for backpressure decisions.
   */
  getConsumerLag(): number {
    return this.consumerLag;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Periodically poll consumer group offsets to estimate lag.
   * Used to implement backpressure (429 responses).
   */
  private startLagPolling(): void {
    const intervalMs = this.configService.get<number>('backpressure.lagCheckIntervalMs') || 5000;

    const poll = async () => {
      try {
        const topics = await this.admin.fetchTopicOffsets('signalrisk.events.raw');
        const latestOffsets = topics.reduce(
          (sum, p) => sum + parseInt(p.offset, 10),
          0,
        );

        // Try to get consumer group offsets for the decision engine consumer
        try {
          const groupOffsets = await this.admin.fetchOffsets({
            groupId: 'signalrisk.cg.decision-engine',
            topics: ['signalrisk.events.raw'],
          });

          const committedOffsets = groupOffsets[0]?.partitions?.reduce(
            (sum, p) => sum + Math.max(0, parseInt(p.offset, 10)),
            0,
          ) ?? 0;

          this.consumerLag = Math.max(0, latestOffsets - committedOffsets);
        } catch {
          // Consumer group may not exist yet; assume no lag
          this.consumerLag = 0;
        }
      } catch {
        // If we can't fetch offsets, keep the last known lag
        this.logger.warn('Failed to fetch consumer lag, keeping last known value');
      }
    };

    // Initial poll
    poll();

    // Recurring poll
    const interval = setInterval(poll, intervalMs);

    // Clean up on shutdown
    this.producer.on('producer.disconnect', () => {
      clearInterval(interval);
    });
  }

  private resolveCompression(): CompressionTypes {
    const comp = this.configService.get<string>('kafka.compression') || 'lz4';
    switch (comp.toLowerCase()) {
      case 'gzip':
        return CompressionTypes.GZIP;
      case 'snappy':
        return CompressionTypes.Snappy;
      case 'lz4':
        return CompressionTypes.LZ4;
      case 'zstd':
        return CompressionTypes.ZSTD;
      default:
        return CompressionTypes.None;
    }
  }
}
