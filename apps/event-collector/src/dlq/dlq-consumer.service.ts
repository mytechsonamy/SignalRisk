/**
 * SignalRisk Event Collector — DLQ Consumer Service
 *
 * Consumes from signalrisk.events.dlq and retries failed events
 * with exponential backoff. After max retries (3), logs to permanent
 * dead letter storage. Idempotent via processed_events tracking.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

  /** Permanent dead letter storage (in-memory for now). */
  private readonly permanentDlq: DlqRecord[] = [];

  private running = false;

  constructor(private readonly configService: ConfigService) {
    this.maxRetries = this.configService.get<number>('dlq.maxRetries') ?? 3;
    this.baseDelayMs = this.configService.get<number>('dlq.baseDelayMs') ?? 1000;
  }

  async onModuleInit(): Promise<void> {
    this.running = true;
    this.logger.log(
      `DLQ Consumer initialized: maxRetries=${this.maxRetries}, baseDelayMs=${this.baseDelayMs}`,
    );
    // In production, this would start a KafkaJS consumer subscribing to
    // signalrisk.events.dlq with consumer group signalrisk.cg.dlq-processor.
    // For now, events are processed via the processRecord() method.
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    this.logger.log('DLQ Consumer shutting down');
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
      return this.exhaustRetries(record);
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
        return this.exhaustRetries(record);
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
   * Get all permanently dead-lettered records (for monitoring/debugging).
   */
  getPermanentDlqRecords(): DlqRecord[] {
    return [...this.permanentDlq];
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
   * Move an event to permanent dead letter storage after max retries.
   */
  private exhaustRetries(record: DlqRecord): 'exhausted' {
    this.logger.warn(
      `DLQ event ${record.eventId} exhausted ${this.maxRetries} retries. ` +
        `Moving to permanent dead letter storage. ` +
        `Reason: ${record.failureReason}, Error: ${record.errorMessage}`,
    );

    this.permanentDlq.push(record);
    this.markProcessed(record.eventId, 'exhausted');
    return 'exhausted';
  }

  /**
   * Re-process the original event. In production, this would re-submit
   * the event to the ingestion pipeline or target topic.
   */
  private async reprocessEvent(
    originalEvent: unknown,
    _dlqRecord: DlqRecord,
  ): Promise<void> {
    // In production, this would:
    // 1. Re-validate the event
    // 2. Send it back to the original topic (e.g., signalrisk.events.raw)
    // 3. Update the retry count in the DLQ message

    // For now, we validate that the original event can be parsed
    if (!originalEvent || typeof originalEvent !== 'object') {
      throw new Error('Cannot reprocess: original event is not a valid object');
    }

    this.logger.debug(
      `Reprocessing event from ${_dlqRecord.originalTopic}`,
    );
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
