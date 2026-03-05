/**
 * SignalRisk Event Collector — Events Service
 *
 * Validates incoming events against JSON Schema, produces valid events
 * to the signalrisk.events.raw Kafka topic, and routes invalid events
 * to the signalrisk.events.dlq dead-letter topic.
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { KafkaService, KafkaMessagePayload } from '../kafka/kafka.service';
import { CreateEventDto } from './dto/create-event.dto';
import * as eventSchema from './schemas/event.schema.json';

export interface EventResult {
  eventId: string;
  accepted: boolean;
  error?: string;
}

export interface IngestResult {
  accepted: number;
  rejected: number;
  results: EventResult[];
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly validate: ValidateFunction;

  private static readonly TOPIC_RAW = 'signalrisk.events.raw';
  private static readonly TOPIC_DLQ = 'signalrisk.events.dlq';

  constructor(private readonly kafkaService: KafkaService) {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    this.validate = ajv.compile(eventSchema);
  }

  /**
   * Ingest a batch of events: validate each, produce valid ones to the raw
   * topic and route invalid ones to the DLQ.
   */
  async ingest(events: CreateEventDto[]): Promise<IngestResult> {
    const validPayloads: KafkaMessagePayload[] = [];
    const dlqPayloads: KafkaMessagePayload[] = [];
    const results: EventResult[] = [];
    let accepted = 0;
    let rejected = 0;

    for (const event of events) {
      const eventId = event.eventId || uuidv4();
      const timestamp = event.timestamp || new Date().toISOString();

      const isValid = this.validate(event) as boolean;

      if (isValid) {
        // Session-salted partition key
        const partitionKey = `${event.merchantId}:${event.sessionId}`;

        const message: KafkaMessagePayload = {
          topic: EventsService.TOPIC_RAW,
          key: partitionKey,
          value: JSON.stringify({
            eventId,
            timestamp,
            source: 'event-collector',
            schemaVersion: 1,
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
          },
        };

        validPayloads.push(message);
        results.push({ eventId, accepted: true });
        accepted++;
      } else {
        const errorMessage = this.validate.errors
          ?.map((e) => `${e.instancePath || '/'} ${e.message}`)
          .join('; ') || 'Unknown validation error';

        this.logger.warn(
          `Event validation failed for merchant ${event.merchantId}: ${errorMessage}`,
        );

        // Route to DLQ
        const dlqMessage: KafkaMessagePayload = {
          topic: EventsService.TOPIC_DLQ,
          key: event.merchantId || 'unknown',
          value: JSON.stringify({
            eventId: uuidv4(),
            timestamp: new Date().toISOString(),
            source: 'event-collector',
            schemaVersion: 1,
            originalTopic: 'http-ingestion',
            originalPartition: 0,
            originalOffset: 0,
            originalValue: JSON.stringify(event),
            errorMessage,
            retryCount: 0,
          }),
          headers: {
            'event-id': eventId,
            'merchant-id': event.merchantId || 'unknown',
            'error-reason': 'validation-failed',
          },
        };

        dlqPayloads.push(dlqMessage);
        results.push({ eventId, accepted: false, error: errorMessage });
        rejected++;
      }
    }

    // Send valid events to raw topic
    if (validPayloads.length > 0) {
      try {
        await this.kafkaService.sendBatch(validPayloads);
        this.logger.log(`Produced ${validPayloads.length} events to ${EventsService.TOPIC_RAW}`);
      } catch (error) {
        this.logger.error(
          `Failed to produce events to ${EventsService.TOPIC_RAW}`,
          (error as Error).stack,
        );
        throw error;
      }
    }

    // Send invalid events to DLQ
    if (dlqPayloads.length > 0) {
      try {
        await this.kafkaService.sendBatch(dlqPayloads);
        this.logger.log(`Routed ${dlqPayloads.length} invalid events to ${EventsService.TOPIC_DLQ}`);
      } catch (error) {
        // DLQ send failure is logged but not thrown — don't fail the whole batch
        this.logger.error(
          `Failed to route events to DLQ: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }

    return { accepted, rejected, results };
  }
}
