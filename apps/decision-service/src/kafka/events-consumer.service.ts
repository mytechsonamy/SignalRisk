/**
 * SignalRisk Decision Service — Kafka Events Consumer
 *
 * Consumes raw events from signalrisk.events.raw, runs them through the
 * decision orchestrator (signal fetching + risk scoring + rule evaluation),
 * persists the decision to PostgreSQL, and publishes it to signalrisk.decisions.
 *
 * This is the core pipeline that turns raw events into fraud decisions.
 *
 * Consumer group: decision-service
 * Topic: signalrisk.events.raw
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { DecisionOrchestratorService } from '../decision/decision-orchestrator.service';
import { DecisionStoreService } from '../decision/decision-store.service';
import { DecisionsProducerService } from './decisions-producer.service';
import { DecisionRequest } from '../decision/decision.types';
import { TOPICS } from '@signalrisk/kafka-config';
import { recordEvent, recordError } from '@signalrisk/telemetry';

const CONSUMER_GROUP = 'decision-service';

@Injectable()
export class EventsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsConsumerService.name);
  private kafka!: Kafka;
  private consumer!: Consumer;
  private connected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly orchestrator: DecisionOrchestratorService,
    private readonly store: DecisionStoreService,
    private readonly producer: DecisionsProducerService,
  ) {}

  async onModuleInit(): Promise<void> {
    const kafkaConfig = this.configService.get('kafka');
    const brokers: string[] = kafkaConfig?.brokers || ['localhost:9092'];
    const clientId: string = kafkaConfig?.clientId || 'decision-service';

    const kafkaOptions: ConstructorParameters<typeof Kafka>[0] = {
      clientId,
      brokers,
      ssl: kafkaConfig?.ssl || false,
      logLevel: logLevel.ERROR,
      retry: { initialRetryTime: 300, retries: 10, maxRetryTime: 30_000, factor: 2 },
      connectionTimeout: 10_000,
      requestTimeout: 30_000,
    };

    const saslMechanism = kafkaConfig?.saslMechanism;
    if (saslMechanism) {
      kafkaOptions.sasl = {
        mechanism: saslMechanism,
        username: kafkaConfig?.saslUsername || '',
        password: kafkaConfig?.saslPassword || '',
      };
    }

    this.kafka = new Kafka(kafkaOptions);
    this.consumer = this.kafka.consumer({
      groupId: kafkaConfig?.groupId || CONSUMER_GROUP,
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
    });

    this.connectConsumer().catch((error) => {
      this.logger.error(
        `Failed to start events consumer: ${(error as Error).message}`,
        (error as Error).stack,
      );
    });
  }

  private async connectConsumer(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: TOPICS.EVENTS_RAW, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    this.connected = true;
    this.logger.log(`Events consumer connected, subscribed to ${TOPICS.EVENTS_RAW} (group: ${CONSUMER_GROUP})`);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.consumer) {
        await this.consumer.disconnect();
        this.connected = false;
        this.logger.log('Events consumer disconnected');
      }
    } catch (error) {
      this.logger.error(`Error disconnecting consumer: ${(error as Error).message}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;
    const value = message.value?.toString();
    if (!value) return;

    // Check test isolation header
    const isTest = message.headers?.['is-test']?.toString() === 'true';

    let rawEvent: {
      eventId: string;
      merchantId: string;
      deviceId?: string;
      sessionId?: string;
      type?: string;
      ipAddress?: string;
      userAgent?: string;
      payload?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      timestamp?: string;
    };

    try {
      rawEvent = JSON.parse(value);
    } catch {
      this.logger.warn('Failed to parse raw event from Kafka, skipping');
      return;
    }

    if (!rawEvent.eventId || !rawEvent.merchantId) {
      this.logger.warn('Raw event missing eventId or merchantId, skipping');
      return;
    }

    // Record event consumed for telemetry
    recordEvent('raw', { merchant_id: rawEvent.merchantId });

    // Map raw event to DecisionRequest
    const request: DecisionRequest = {
      requestId: rawEvent.eventId,
      merchantId: rawEvent.merchantId,
      deviceId: rawEvent.deviceId,
      sessionId: rawEvent.sessionId,
      entityId: rawEvent.deviceId || rawEvent.eventId,
      ip: rawEvent.ipAddress,
      amount: rawEvent.payload?.amount as number | undefined,
    };

    try {
      // Run through the full decision pipeline
      const result = await this.orchestrator.decide(request);

      // Attach deviceId and mark test flag for downstream consumers
      (result as any).deviceId = rawEvent.deviceId || null;
      result.isTest = isTest;

      // Persist to PostgreSQL (fire-and-forget pattern from existing code)
      this.store.save(result).catch((err) => {
        this.logger.error(`Failed to persist decision: ${(err as Error).message}`);
      });

      // Publish to signalrisk.decisions for webhook-service and case-service
      this.producer.publishDecision(result, isTest).catch((err) => {
        this.logger.error(`Failed to publish decision: ${(err as Error).message}`);
      });

      this.logger.debug(
        `Processed event ${rawEvent.eventId} → ${result.action} (score=${result.riskScore}, ${result.latencyMs}ms)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process event ${rawEvent.eventId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      recordError('decision-service', 'event_processing_failure', { event_id: rawEvent.eventId });
    }
  }
}
