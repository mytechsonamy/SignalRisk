/**
 * SignalRisk Velocity Engine — Kafka Event Consumer
 *
 * Consumes raw events from signalrisk.events.raw and updates
 * velocity counters for each merchant+entity pair.
 *
 * Sprint 1 (Stateful Fraud): Single event now produces 3 velocity updates
 * for customer, device, and IP entity types (ADR-009).
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
import { TOPICS } from '@signalrisk/kafka-config';

const CONSUMER_GROUP = 'velocity-engine';
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
      await this.consumer.subscribe({ topic: TOPICS.EVENTS_RAW, fromBeginning: false });

      await this.consumer.run({
        eachMessage: async (payload) => this.handleMessage(payload),
      });

      this.logger.log(`Kafka consumer connected, subscribed to ${TOPICS.EVENTS_RAW} (group: ${CONSUMER_GROUP})`);
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
      // Legacy fields (velocity-native schema)
      transactionId?: string;
      amountMinor?: number;
      deviceFingerprint?: string;
      // Fields from event-collector schema
      deviceId?: string;
      sessionId?: string;
      type?: string;
      payload?: { amount?: number; customerId?: string; [key: string]: unknown };
      ipAddress?: string;
      timestamp: string;
      metadata?: Record<string, unknown>;
      // Typed entity fields (Sprint 1)
      customerId?: string;
      entityId?: string;
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

    // Test isolation: prefix merchantId to namespace Redis keys
    const isTest = message.headers?.['is-test']?.toString() === 'true';
    const effectiveMerchantId = isTest
      ? `test:${rawEvent.merchantId}`
      : rawEvent.merchantId;

    // Extract common fields
    const amountMinor = rawEvent.amountMinor ?? Math.round((rawEvent.payload?.amount ?? 0) * 100);
    const deviceFingerprint = rawEvent.deviceFingerprint || rawEvent.deviceId;
    const ipAddress = rawEvent.ipAddress;
    const sessionId = rawEvent.sessionId || (rawEvent.metadata?.sessionId as string) || undefined;
    const timestampSeconds = Math.floor(new Date(rawEvent.timestamp).getTime() / 1000);

    // --- Entity ID resolution per ADR-009 ---
    // customer: payload.customerId || entityId || transactionId || eventId
    const customerId = rawEvent.customerId
      || rawEvent.payload?.customerId as string
      || rawEvent.entityId
      || rawEvent.transactionId
      || rawEvent.eventId;

    // device: deviceId/deviceFingerprint (authoritative: device-intel-service)
    const deviceId = rawEvent.deviceId || rawEvent.deviceFingerprint;

    // ip: ipAddress (raw, lowercase normalized)
    const normalizedIp = ipAddress?.toLowerCase().trim();

    // --- Build velocity events for each entity type (ADR-009) ---
    const baseEvent = {
      eventId: rawEvent.eventId,
      merchantId: effectiveMerchantId,
      amountMinor,
      deviceFingerprint,
      ipAddress,
      sessionId,
      timestampSeconds,
    };

    // Always update customer counters
    const customerEvent: VelocityEvent = {
      ...baseEvent,
      entityId: customerId,
      entityType: 'customer',
    };

    // Update device counters if deviceId is available
    const deviceEvent: VelocityEvent | null = deviceId
      ? { ...baseEvent, entityId: deviceId, entityType: 'device' }
      : null;

    // Update IP counters if ipAddress is available
    const ipEvent: VelocityEvent | null = normalizedIp
      ? { ...baseEvent, entityId: normalizedIp, entityType: 'ip' }
      : null;

    try {
      // Execute all entity type updates
      const updates: Promise<void>[] = [
        this.velocityService.incrementVelocity(customerEvent),
      ];
      if (deviceEvent) {
        updates.push(this.velocityService.incrementVelocity(deviceEvent));
      }
      if (ipEvent) {
        updates.push(this.velocityService.incrementVelocity(ipEvent));
      }

      await Promise.all(updates);
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
