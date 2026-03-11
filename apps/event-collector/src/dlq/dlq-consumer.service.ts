/**
 * SignalRisk Event Collector — DLQ Consumer Service
 *
 * Consumes from signalrisk.events.dlq and retries failed events
 * with exponential backoff. After max retries (3), logs to permanent
 * dead letter storage. Idempotent via processed_events tracking.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { TOPICS, CONSUMER_GROUPS } from '@signalrisk/kafka-config';
import { KafkaService } from '../kafka/kafka.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DlqRecord {
  eventId: string;
  timestamp: string;
  source: string;
  schemaVersion: number;
  originalTopic: string;
  originalPartition: number;
  originalOffset: number;
  originalValue: string;
  errorMessage: string;
  validationErrors: Array<{ path: string; message: string; keyword: string }>;
  failureReason: string;
  retryCount: number;
}

export interface ProcessedEvent {
  eventId: string;
  processedAt: string;
  outcome: 'retried' | 'exhausted' | 'skipped';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DlqConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DlqConsumerService.name);

  /** Maximum number of retry attempts before moving to permanent dead letter. */
  private readonly maxRetries: number;

  /** Base delay in milliseconds for exponential backoff. */
  private readonly baseDelayMs: number;

  /**
   * In-memory set of processed event IDs for idempotency.
   * In production, replace with a processed_events database table.
   */
  private readonly processedEvents: Map<string, ProcessedEvent> = new Map();

  /** Exhausted event cache (in-memory, capped at 1000 FIFO). */
  private readonly exhaustedEventCache: DlqRecord[] = [];

  private static readonly CACHE_CAP = 1000;

  private running = false;
  private consumer: Consumer | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly kafkaService: KafkaService,
  ) {
    this.maxRetries = this.configService.get<number>('dlq.maxRetries') ?? 3;
    this.baseDelayMs = this.configService.get<number>('dlq.baseDelayMs') ?? 1000;
  }

  async onModuleInit(): Promise<void> {
    this.running = true;
    this.logger.log(
      `DLQ Consumer initialized: maxRetries=${this.maxRetries}, baseDelayMs=${this.baseDelayMs}`,
    );

    // Start Kafka consumer for DLQ topic
    const enabled = this.configService.get<string>('DLQ_CONSUMER_ENABLED', 'true');
    if (enabled === 'false') {
      this.logger.log('DLQ Consumer disabled via DLQ_CONSUMER_ENABLED=false');
      return;
    }

    try {
      const brokers = (this.configService.get<string>('KAFKA_BROKERS') || 'localhost:9092').split(',');
      const kafka = new Kafka({
        clientId: 'event-collector-dlq',
        brokers,
        logLevel: logLevel.ERROR,
        retry: { retries: 5 },
      });

      this.consumer = kafka.consumer({
        groupId: CONSUMER_GROUPS.DLQ_PROCESSOR,
        sessionTimeout: 30_000,
        heartbeatInterval: 3_000,
      });

      await this.consumer.connect();
      await this.consumer.subscribe({
        topic: TOPICS.EVENTS_DLQ,
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          if (!this.running) return;
          try {
            const value = payload.message.value?.toString();
            if (!value) return;

            const dlqRecord = this.parseMessage(payload, value);
            await this.processRecord(dlqRecord);
          } catch (err) {
            this.logger.error(`DLQ message processing error: ${(err as Error).message}`);
          }
        },
      });

      this.logger.log(`DLQ Consumer started — subscribing to ${TOPICS.EVENTS_DLQ}`);
    } catch (err) {
      this.logger.error(`DLQ Consumer failed to start: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    if (this.consumer) {
      try {
        await this.consumer.disconnect();
      } catch {
        // ignore disconnect errors during shutdown
      }
    }
    this.logger.log('DLQ Consumer shutting down');
  }

  private parseMessage(payload: EachMessagePayload, value: string): DlqRecord {
    try {
      const parsed = JSON.parse(value);
      return {
        eventId: parsed.eventId || payload.message.headers?.['event-id']?.toString() || 'unknown',
        timestamp: parsed.timestamp || new Date().toISOString(),
        source: parsed.source || 'event-collector',
        schemaVersion: parsed.schemaVersion || 1,
        originalTopic: parsed.originalTopic || payload.message.headers?.['dlq-original-topic']?.toString() || TOPICS.EVENTS_RAW,
        originalPartition: parsed.originalPartition || payload.partition,
        originalOffset: parsed.originalOffset || Number(payload.message.offset),
        originalValue: parsed.originalValue || value,
        errorMessage: parsed.errorMessage || '',
        validationErrors: parsed.validationErrors || [],
        failureReason: parsed.failureReason || 'unknown',
        retryCount: parsed.retryCount ?? Number(payload.message.headers?.['dlq-retry-count']?.toString() || '0'),
      };
    } catch {
      return {
        eventId: payload.message.headers?.['event-id']?.toString() || 'unknown',
        timestamp: new Date().toISOString(),
        source: 'event-collector',
        schemaVersion: 1,
        originalTopic: TOPICS.EVENTS_RAW,
        originalPartition: payload.partition,
        originalOffset: Number(payload.message.offset),
        originalValue: value,
        errorMessage: 'Failed to parse DLQ record',
        validationErrors: [],
        failureReason: 'parse_error',
        retryCount: 0,
      };
    }
  }

  /**
   * Process a single DLQ record. Called by the Kafka consumer handler.
   *
   * Returns the processing outcome:
   * - 'retried': event was re-queued for processing
   * - 'exhausted': max retries reached, moved to permanent dead letter
   * - 'skipped': already processed (idempotency check)
   */
  async processRecord(record: DlqRecord): Promise<'retried' | 'exhausted' | 'skipped'> {
    // Idempotency check: skip if already processed
    if (this.processedEvents.has(record.eventId)) {
      this.logger.debug(`Skipping already-processed DLQ event: ${record.eventId}`);
      return 'skipped';
    }

    // Check retry count
    if (record.retryCount >= this.maxRetries) {
      return await this.exhaustRetries(record);
    }

    // Calculate exponential backoff delay
    const delay = this.calculateBackoff(record.retryCount);

    this.logger.log(
      `Retrying DLQ event ${record.eventId}: attempt ${record.retryCount + 1}/${this.maxRetries}, ` +
        `delay=${delay}ms, reason=${record.failureReason}`,
    );

    // Wait for backoff delay
    await this.sleep(delay);

    if (!this.running) {
      this.logger.warn('DLQ Consumer stopped during backoff, skipping retry');
      return 'skipped';
    }

    // Attempt to reprocess the original event
    try {
      const originalEvent = JSON.parse(record.originalValue);
      await this.reprocessEvent(originalEvent, record);

      // Mark as processed
      this.markProcessed(record.eventId, 'retried');
      return 'retried';
    } catch (error) {
      this.logger.error(
        `Retry failed for DLQ event ${record.eventId}: ${(error as Error).message}`,
      );

      // If this was the last attempt, exhaust
      if (record.retryCount + 1 >= this.maxRetries) {
        return await this.exhaustRetries(record);
      }

      // Mark as processed (this attempt) to avoid duplicate processing
      this.markProcessed(record.eventId, 'retried');
      return 'retried';
    }
  }

  /**
   * Calculate exponential backoff delay with jitter.
   * Formula: baseDelay * 2^retryCount + random jitter
   */
  calculateBackoff(retryCount: number): number {
    const exponentialDelay = this.baseDelayMs * Math.pow(2, retryCount);
    const jitter = Math.random() * this.baseDelayMs * 0.5;
    return Math.min(exponentialDelay + jitter, 30_000); // Cap at 30 seconds
  }

  /**
   * Check if an event has already been processed (idempotency).
   */
  isProcessed(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  /**
   * Get all exhausted (permanently dead-lettered) records (for monitoring/debugging).
   */
  getPermanentDlqRecords(): DlqRecord[] {
    return [...this.exhaustedEventCache];
  }

  /**
   * Get the count of processed events.
   */
  getProcessedCount(): number {
    return this.processedEvents.size;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Move an event to the exhausted Kafka topic and the in-memory cache after max retries.
   * Publishes to signalrisk.events.dlq.exhausted, then appends to exhaustedEventCache (FIFO, capped at 1000).
   */
  private async exhaustRetries(record: DlqRecord): Promise<'exhausted'> {
    const eventId =
      (record as unknown as { headers?: Record<string, unknown> }).headers?.[
        'event-id'
      ]?.toString() ?? record.eventId;

    const originalTopic =
      (record as unknown as { headers?: Record<string, unknown> }).headers?.[
        'dlq-original-topic'
      ]?.toString() ?? record.originalTopic ?? '';

    const retryCount = record.retryCount;

    // 1. Publish to the exhausted Kafka topic
    await this.kafkaService.sendBatch([
      {
        topic: TOPICS.EVENTS_DLQ_EXHAUSTED,
        key: record.eventId,
        value: record.originalValue,
        headers: {
          'dlq-event-id': eventId,
          'dlq-original-topic': originalTopic,
          'dlq-final-retry-count': String(retryCount),
        },
      },
    ]);

    // 2. Append to the in-memory cache with FIFO cap at 1000
    if (this.exhaustedEventCache.length >= DlqConsumerService.CACHE_CAP) {
      this.exhaustedEventCache.shift();
    }
    this.exhaustedEventCache.push(record);

    // 3. Warn with event ID, original topic, and final retry count
    this.logger.warn(
      `DLQ event ${record.eventId} exhausted after ${retryCount} retries. ` +
        `Published to signalrisk.events.dlq.exhausted. ` +
        `originalTopic=${originalTopic}, finalRetryCount=${retryCount}`,
    );

    this.markProcessed(record.eventId, 'exhausted');
    return 'exhausted';
  }

  /**
   * Re-process the original event by republishing it to the raw events topic.
   *
   * Uses the partition key from the original record metadata (merchantId:sessionId
   * pattern) so that events for the same session remain ordered on the same partition.
   */
  private async reprocessEvent(
    originalEvent: unknown,
    dlqRecord: DlqRecord,
  ): Promise<void> {
    if (!originalEvent || typeof originalEvent !== 'object') {
      throw new Error('Cannot reprocess: original event is not a valid object');
    }

    const event = originalEvent as Record<string, unknown>;
    const merchantId = String(event['merchantId'] ?? 'unknown');
    const sessionId = String(event['sessionId'] ?? 'unknown');
    const partitionKey = `${merchantId}:${sessionId}`;

    this.logger.log(
      `Republishing DLQ event ${dlqRecord.eventId} to ${TOPICS.EVENTS_RAW} ` +
        `(attempt ${dlqRecord.retryCount + 1}, originalTopic=${dlqRecord.originalTopic})`,
    );

    await this.kafkaService.sendBatch([
      {
        topic: TOPICS.EVENTS_RAW,
        key: partitionKey,
        value: dlqRecord.originalValue,
        headers: {
          'event-id': dlqRecord.eventId,
          'merchant-id': merchantId,
          'dlq-retry-count': String(dlqRecord.retryCount + 1),
          'dlq-original-topic': dlqRecord.originalTopic,
        },
      },
    ]);
  }

  /**
   * Mark an event as processed for idempotency.
   */
  private markProcessed(
    eventId: string,
    outcome: ProcessedEvent['outcome'],
  ): void {
    this.processedEvents.set(eventId, {
      eventId,
      processedAt: new Date().toISOString(),
      outcome,
    });
  }

  /**
   * Sleep utility for backoff delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
