/**
 * SignalRisk Decision Service — Kafka Decisions Producer
 *
 * Publishes decision results to the signalrisk.decisions topic.
 * Consumers: webhook-service, case-service.
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, logLevel } from 'kafkajs';
import { DecisionResult } from '../decision/decision.types';

const TOPIC = 'signalrisk.decisions';

@Injectable()
export class DecisionsProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DecisionsProducerService.name);
  private kafka!: Kafka;
  private producer!: Producer;
  private connected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const kafkaConfig = this.configService.get('kafka');
    const brokers: string[] = kafkaConfig?.brokers || ['localhost:9092'];
    const clientId: string = (kafkaConfig?.clientId || 'decision-service') + '-producer';

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
    this.producer = this.kafka.producer();

    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.log(`Kafka producer connected, publishing to ${TOPIC}`);
    } catch (error) {
      this.logger.error(`Failed to connect Kafka producer: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.producer) {
        await this.producer.disconnect();
        this.connected = false;
        this.logger.log('Kafka producer disconnected');
      }
    } catch (error) {
      this.logger.error(`Error disconnecting producer: ${(error as Error).message}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async publishDecision(result: DecisionResult, isTest = false): Promise<void> {
    if (!this.connected) {
      this.logger.warn('Kafka producer not connected, skipping publish');
      return;
    }

    try {
      const headers: Record<string, string> = {
        'request-id': result.requestId,
        'merchant-id': result.merchantId,
        'decision': result.action,
      };
      if (isTest) {
        headers['is-test'] = 'true';
      }

      await this.producer.send({
        topic: TOPIC,
        messages: [
          {
            key: result.merchantId,
            value: JSON.stringify({
              requestId: result.requestId,
              merchantId: result.merchantId,
              action: result.action,
              entityId: (result as any).deviceId || result.requestId,
              riskScore: result.riskScore,
              riskFactors: result.riskFactors,
              appliedRules: result.appliedRules,
              latencyMs: result.latencyMs,
              isTest: isTest,
              timestamp: result.createdAt instanceof Date ? result.createdAt.toISOString() : new Date().toISOString(),
              signals: {},
            }),
            headers,
          },
        ],
      });

      this.logger.debug(
        `Published decision ${result.requestId}: ${result.action} (score=${result.riskScore})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish decision ${result.requestId}: ${(error as Error).message}`,
      );
    }
  }
}
