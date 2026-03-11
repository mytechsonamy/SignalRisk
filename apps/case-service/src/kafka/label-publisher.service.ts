/**
 * Sprint 6: Label Publisher Service
 *
 * Publishes analyst label events to signalrisk.state.labels topic
 * when cases are resolved (ADR-012).
 *
 * Label event schema:
 * {
 *   caseId: string,
 *   merchantId: string,
 *   entityId: string,
 *   resolution: 'FRAUD' | 'LEGITIMATE' | 'INCONCLUSIVE',
 *   resolvedAt: string (ISO 8601),
 *   timestamp: string (ISO 8601),
 * }
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, logLevel } from 'kafkajs';
import { TOPICS } from '@signalrisk/kafka-config';

export interface LabelEvent {
  caseId: string;
  merchantId: string;
  entityId: string;
  entityType: 'customer' | 'device' | 'ip';
  resolution: 'FRAUD' | 'LEGITIMATE' | 'INCONCLUSIVE';
  resolutionNotes?: string | null;
  resolvedAt: string;
  timestamp: string;
}

@Injectable()
export class LabelPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LabelPublisherService.name);
  private producer: Producer;
  private connected = false;

  constructor(private readonly configService: ConfigService) {
    const kafkaConfig = this.configService.get('kafka');
    const brokers: string[] = kafkaConfig?.brokers || ['localhost:9092'];
    const clientId: string = kafkaConfig?.clientId || 'case-service-label-publisher';
    const ssl: boolean = kafkaConfig?.ssl || false;

    const kafka = new Kafka({
      clientId,
      brokers,
      ssl,
      logLevel: logLevel.ERROR,
      retry: { initialRetryTime: 300, retries: 5 },
    });

    this.producer = kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.log('Label publisher connected to Kafka');
    } catch (err) {
      this.logger.warn(
        `Label publisher failed to connect: ${(err as Error).message}. Labels will not be published.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }

  /**
   * Publish a resolution label event to signalrisk.state.labels.
   * Fails silently — label publishing should never block case resolution.
   */
  async publishLabel(event: LabelEvent): Promise<void> {
    if (!this.connected) {
      this.logger.warn('Label publisher not connected — skipping publish');
      return;
    }

    try {
      await this.producer.send({
        topic: TOPICS.STATE_LABELS,
        messages: [
          {
            key: `${event.merchantId}:${event.entityId}`,
            value: JSON.stringify(event),
          },
        ],
      });
      this.logger.debug(
        `Published label: caseId=${event.caseId} resolution=${event.resolution} entity=${event.entityId}`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to publish label for case ${event.caseId}: ${(err as Error).message}`,
      );
    }
  }
}
