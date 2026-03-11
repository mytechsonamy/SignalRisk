/**
 * SignalRisk Event Collector — Dead Letter Queue Service
 *
 * Produces failed events to signalrisk.events.dlq with enriched context
 * including validation errors, retry count, and debugging metadata.
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { TOPICS } from '@signalrisk/kafka-config';
import { KafkaService, KafkaMessagePayload } from '../kafka/kafka.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DlqEnrichment {
  /** The original event that failed processing. */
  originalEvent: unknown;
  /** Validation error details. */
  validationErrors: DlqValidationError[];
  /** Reason for dead-lettering. */
  failureReason: DlqFailureReason;
  /** Number of retry attempts so far. */
  retryCount: number;
  /** The topic the original message was destined for. */
  originalTopic: string;
  /** Optional partition info. */
  originalPartition?: number;
  /** Optional offset info. */
  originalOffset?: number;
}

export interface DlqValidationError {
  path: string;
  message: string;
  keyword: string;
}

export type DlqFailureReason =
  | 'validation-failed'
  | 'processing-error'
  | 'deserialization-error'
  | 'unknown';

export interface DlqMessage {
  eventId: string;
  timestamp: string;
  source: string;
  schemaVersion: number;
  originalTopic: string;
  originalPartition: number;
  originalOffset: number;
  originalValue: string;
  errorMessage: string;
  validationErrors: DlqValidationError[];
  failureReason: DlqFailureReason;
  retryCount: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(private readonly kafkaService: KafkaService) {}

  /**
   * Send a failed event to the dead letter queue with enriched metadata.
   */
  async sendToDlq(enrichment: DlqEnrichment): Promise<void> {
    const eventId = uuidv4();
    const timestamp = new Date().toISOString();

    const errorMessage =
      enrichment.validationErrors.length > 0
        ? enrichment.validationErrors
            .map((e) => `${e.path} ${e.message}`)
            .join('; ')
        : enrichment.failureReason;

    const dlqMessage: DlqMessage = {
      eventId,
      timestamp,
      source: 'event-collector',
      schemaVersion: 1,
      originalTopic: enrichment.originalTopic,
      originalPartition: enrichment.originalPartition ?? 0,
      originalOffset: enrichment.originalOffset ?? 0,
      originalValue: JSON.stringify(enrichment.originalEvent),
      errorMessage,
      validationErrors: enrichment.validationErrors,
      failureReason: enrichment.failureReason,
      retryCount: enrichment.retryCount,
    };

    const merchantId = this.extractMerchantId(enrichment.originalEvent);

    const payload: KafkaMessagePayload = {
      topic: TOPICS.EVENTS_DLQ,
      key: merchantId,
      value: JSON.stringify(dlqMessage),
      headers: {
        'dlq-reason': enrichment.failureReason,
        'original-topic': enrichment.originalTopic,
        'retry-count': String(enrichment.retryCount),
        'error-details': errorMessage.substring(0, 1000),
        'event-id': eventId,
        'merchant-id': merchantId,
      },
    };

    try {
      await this.kafkaService.send(payload);
      this.logger.log(
        `Sent event to DLQ: eventId=${eventId}, reason=${enrichment.failureReason}, retryCount=${enrichment.retryCount}`,
      );
    } catch (error) {
      // DLQ send failures are logged but not thrown to avoid cascading failures
      this.logger.error(
        `Failed to send event to DLQ: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * Send a batch of failed events to the DLQ.
   */
  async sendBatchToDlq(enrichments: DlqEnrichment[]): Promise<void> {
    const payloads: KafkaMessagePayload[] = [];

    for (const enrichment of enrichments) {
      const eventId = uuidv4();
      const timestamp = new Date().toISOString();

      const errorMessage =
        enrichment.validationErrors.length > 0
          ? enrichment.validationErrors
              .map((e) => `${e.path} ${e.message}`)
              .join('; ')
          : enrichment.failureReason;

      const dlqMessage: DlqMessage = {
        eventId,
        timestamp,
        source: 'event-collector',
        schemaVersion: 1,
        originalTopic: enrichment.originalTopic,
        originalPartition: enrichment.originalPartition ?? 0,
        originalOffset: enrichment.originalOffset ?? 0,
        originalValue: JSON.stringify(enrichment.originalEvent),
        errorMessage,
        validationErrors: enrichment.validationErrors,
        failureReason: enrichment.failureReason,
        retryCount: enrichment.retryCount,
      };

      const merchantId = this.extractMerchantId(enrichment.originalEvent);

      payloads.push({
        topic: TOPICS.EVENTS_DLQ,
        key: merchantId,
        value: JSON.stringify(dlqMessage),
        headers: {
          'dlq-reason': enrichment.failureReason,
          'original-topic': enrichment.originalTopic,
          'retry-count': String(enrichment.retryCount),
          'error-details': errorMessage.substring(0, 1000),
          'event-id': eventId,
          'merchant-id': merchantId,
        },
      });
    }

    try {
      await this.kafkaService.sendBatch(payloads);
      this.logger.log(`Sent ${payloads.length} events to DLQ`);
    } catch (error) {
      this.logger.error(
        `Failed to send batch to DLQ: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * Extract merchantId from an event object, falling back to 'unknown'.
   */
  private extractMerchantId(event: unknown): string {
    if (
      event &&
      typeof event === 'object' &&
      'merchantId' in event &&
      typeof (event as Record<string, unknown>).merchantId === 'string'
    ) {
      return (event as Record<string, unknown>).merchantId as string;
    }
    return 'unknown';
  }
}
