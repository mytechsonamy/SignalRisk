/**
 * SignalRisk Velocity Engine — Kafka Event Consumer
 *
 * Consumes raw events from signalrisk.events.raw and updates
 * velocity counters for each merchant+entity pair.
 *
 * Consumer group: velocity-engine
 * Idempotent via Redis SET (processed event IDs).
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { VelocityService } from '../velocity/velocity.service';
import { VelocityEvent } from '../velocity/velocity.types';
import Redis from 'ioredis';

const CONSUMER_GROUP = 'velocity-engine';
const TOPIC = 'signalrisk.events.raw';
const PROCESSED_KEY_PREFIX = 'vel:processed:';
const PROCESSED_TTL_SECONDS = 86400; // 24h dedup window

@Injectable()
export class VelocityEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VelocityEventConsumer.name);
  private kafka!: Kafka;
  private consumer!: Consumer;
  private redis!: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly velocityService: VelocityService,
  ) {}

  async onModuleInit(): Promise<void> {
    const brokers = this.configService.get<string[]>('kafka.brokers') || ['localhost:9092'];
    const clientId = this.configService.get<string>('kafka.clientId') || 'velocity-engine';
    const ssl = this.configService.get<boolean>('kafka.ssl') || false;

    this.kafka = new Kafka({
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
    });

    // Separate Redis connection for idempotency checks
    this.redis = new Redis({
      host: this.configService.get<string>('redis.host') || 'localhost',
      port: this.configService.get<number>('redis.port') || 6379,
      password: this.configService.get<string>('redis.password') || undefined,
      db: this.configService.get<number>('redis.db') || 0,
    });

    this.consumer = this.kafka.consumer({
      groupId: CONSUMER_GROUP,
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
      maxBytesPerPartition: 1_048_576, // 1MB
    });

    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topic: TOPIC, fromBeginning: false });

      await this.consumer.run({
        eachMessage: async (payload) => this.handleMessage(payload),
      });

      this.logger.log(`Kafka consumer connected, subscribed to ${TOPIC} (group: ${CONSUMER_GROUP})`);
    } catch (error) {
      this.logger.error(`Failed to start Kafka consumer: ${(error as Error).message}`);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.consumer) {
        await this.consumer.disconnect();
      }
      if (this.redis) {
        await this.redis.quit();
      }
      this.logger.log('Kafka consumer disconnected');
    } catch (error) {
      this.logger.error(`Error disconnecting consumer: ${(error as Error).message}`);
    }
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;
    const value = message.value?.toString();

    if (!value) {
      return;
    }

    let rawEvent: {
      eventId: string;
      merchantId: string;
      transactionId: string;
      amountMinor: number;
      ipAddress?: string;
      deviceFingerprint?: string;
      timestamp: string;
      metadata?: Record<string, unknown>;
    };

    try {
      rawEvent = JSON.parse(value);
    } catch {
      this.logger.warn('Failed to parse Kafka message, skipping');
      return;
    }

    // Idempotency check: have we already processed this event?
    const processedKey = `${PROCESSED_KEY_PREFIX}${rawEvent.eventId}`;
    const alreadyProcessed = await this.redis.set(
      processedKey,
      '1',
      'EX',
      PROCESSED_TTL_SECONDS,
      'NX',
    );

    // If SET NX returned null, the key already existed => duplicate
    if (alreadyProcessed === null) {
      return;
    }

    // Build VelocityEvent from the raw Kafka message
    const velocityEvent: VelocityEvent = {
      eventId: rawEvent.eventId,
      merchantId: rawEvent.merchantId,
      entityId: rawEvent.transactionId, // Entity = transaction reference
      amountMinor: rawEvent.amountMinor,
      deviceFingerprint: rawEvent.deviceFingerprint,
      ipAddress: rawEvent.ipAddress,
      sessionId: (rawEvent.metadata?.sessionId as string) || undefined,
      timestampSeconds: Math.floor(new Date(rawEvent.timestamp).getTime() / 1000),
    };

    try {
      await this.velocityService.incrementVelocity(velocityEvent);
    } catch (error) {
      this.logger.error(
        `Failed to increment velocity for event ${rawEvent.eventId}: ${(error as Error).message}`,
      );
      // Remove the processed marker so it can be retried
      await this.redis.del(processedKey);
      throw error;
    }
  }
}
