/**
 * SignalRisk Event Collector — Events Service
 *
 * Validates incoming events using the shared @signalrisk/event-schemas
 * package with per-type JSON Schema validation. Valid events are produced
 * to the signalrisk.events.raw Kafka topic; invalid events are routed
 * to the DLQ via the DlqService with detailed error context.
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { EventSchemaValidator, ValidationResult } from '@signalrisk/event-schemas';
import { TOPICS } from '@signalrisk/kafka-config';
import { KafkaService, KafkaMessagePayload } from '../kafka/kafka.service';
import { DlqService, DlqValidationError } from '../dlq/dlq.service';
import { CreateEventDto } from './dto/create-event.dto';

export interface EventResult {
  eventId: string;
  accepted: boolean;
  error?: string;
  validationErrors?: DlqValidationError[];
}

export interface IngestResult {
  accepted: number;
  rejected: number;
  results: EventResult[];
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly validator: EventSchemaValidator;

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly dlqService: DlqService,
  ) {
    this.validator = new EventSchemaValidator();
  }

  /**
   * Ingest a batch of events: validate each against its type-specific schema,
   * produce valid ones to the raw topic, and route invalid ones to the DLQ.
   */
  async ingest(events: CreateEventDto[], isTest = false): Promise<IngestResult> {
    const validPayloads: KafkaMessagePayload[] = [];
    const invalidEvents: Array<{
      event: CreateEventDto;
      eventId: string;
      result: ValidationResult;
    }> = [];
    const results: EventResult[] = [];
    let accepted = 0;
    let rejected = 0;

    for (const event of events) {
      const eventId = event.eventId || uuidv4();
      const timestamp = event.timestamp || new Date().toISOString();

      // Validate envelope + type-specific payload schema
      const validationResult = this.validator.validate(event);

      if (validationResult.valid) {
        const partitionKey = `${event.merchantId}:${event.sessionId}`;

        const message: KafkaMessagePayload = {
          topic: TOPICS.EVENTS_RAW,
          key: partitionKey,
          value: JSON.stringify({
            eventId,
            timestamp,
            source: 'event-collector',
            schemaVersion: this.validator.getSchemaVersion(),
            merchantId: event.merchantId,
            deviceId: event.deviceId,
            sessionId: event.sessionId,
            type: event.type,
            payload: event.payload,
            ipAddress: event.ipAddress,
            userAgent: event.userAgent,
            pageUrl: event.pageUrl,
            referrer: event.referrer,
          }),
          headers: {
            'event-id': eventId,
            'merchant-id': event.merchantId,
            'event-type': event.type,
            'schema-version': String(this.validator.getSchemaVersion()),
            ...(isTest ? { 'is-test': 'true' } : {}),
          },
        };

        validPayloads.push(message);
        results.push({ eventId, accepted: true });
        accepted++;
      } else {
        const errorMessage = validationResult.errors
          .map((e) => `${e.path} ${e.message}`)
          .join('; ');

        this.logger.warn(
          `Event validation failed for merchant ${event.merchantId}, ` +
            `type=${event.type}: ${errorMessage}`,
        );

        invalidEvents.push({ event, eventId, result: validationResult });
        results.push({
          eventId,
          accepted: false,
          error: errorMessage,
          validationErrors: validationResult.errors.map((e) => ({
            path: e.path,
            message: e.message,
            keyword: e.keyword,
          })),
        });
        rejected++;
      }
    }

    // Send valid events to raw topic
    if (validPayloads.length > 0) {
      try {
        await this.kafkaService.sendBatch(validPayloads);
        this.logger.log(
          `Produced ${validPayloads.length} events to ${TOPICS.EVENTS_RAW}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to produce events to ${TOPICS.EVENTS_RAW}`,
          (error as Error).stack,
        );
        throw error;
      }
    }

    // Route invalid events to DLQ via DlqService (fire-and-forget with timeout)
    if (invalidEvents.length > 0) {
      const dlqPayload = invalidEvents.map(({ event, result }) => ({
        originalEvent: event,
        validationErrors: result.errors.map((e) => ({
          path: e.path,
          message: e.message,
          keyword: e.keyword,
        })),
        failureReason: 'validation-failed' as const,
        retryCount: 0,
        originalTopic: 'http-ingestion',
      }));

      // DLQ send with 5s timeout to avoid hanging the HTTP response
      const dlqTimeout = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('DLQ send timed out after 5s')), 5000),
      );

      try {
        await Promise.race([
          this.dlqService.sendBatchToDlq(dlqPayload),
          dlqTimeout,
        ]);
        this.logger.log(
          `Routed ${invalidEvents.length} invalid events to DLQ`,
        );
      } catch (error) {
        // DLQ send failure is logged but not thrown -- don't fail the whole batch
        this.logger.error(
          `Failed to route events to DLQ: ${(error as Error).message}`,
        );
      }
    }

    return { accepted, rejected, results };
  }
}
