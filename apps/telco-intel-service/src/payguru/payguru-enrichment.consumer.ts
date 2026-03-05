/**
 * SignalRisk Telco Intel — Payguru Enrichment Kafka Consumer
 *
 * Consumes Payguru enrichment events from `payguru.enrichment.events`,
 * enriches them with MSISDN prefix lookup, and publishes a TelcoSignal
 * to `telco.signals`.
 *
 * Dead-letter queue: `payguru.enrichment.events.dlq` (parse/processing errors)
 * Consumer group: telco-intel-payguru-consumer
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, Producer, EachMessagePayload, logLevel } from 'kafkajs';
import { TelcoIntelService } from '../telco/telco-intel.service';

export interface PayguruEnrichmentEvent {
  msisdn: string;
  merchantId: string;
  portDate?: string;    // ISO date string
  isPorted: boolean;
  lineType?: 'prepaid' | 'postpaid';
  requestId: string;
}

export interface TelcoSignal {
  requestId: string;
  msisdn: string;
  merchantId: string;
  operator?: string;
  lineType: 'prepaid' | 'postpaid' | 'unknown';
  isPorted: boolean;
  portDate?: string;
  prepaidProbability: number;
  countryCode?: string;
  processedAt: string;
}

const TOPIC = 'payguru.enrichment.events';
const DLQ_TOPIC = 'payguru.enrichment.events.dlq';
const SIGNALS_TOPIC = 'telco.signals';
const CONSUMER_GROUP = 'telco-intel-payguru-consumer';

@Injectable()
export class PayguruEnrichmentConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayguruEnrichmentConsumer.name);
  private kafka!: Kafka;
  private consumer!: Consumer;
  private producer!: Producer;
  private connected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly telcoIntelService: TelcoIntelService,
  ) {}

  async onModuleInit(): Promise<void> {
    const kafkaConfig = this.configService.get('kafka');
    const brokers: string[] = kafkaConfig?.brokers || ['localhost:9092'];
    const clientId: string = kafkaConfig?.clientId || 'telco-intel-service';
    const ssl: boolean = kafkaConfig?.ssl || false;

    const kafkaOptions: ConstructorParameters<typeof Kafka>[0] = {
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
      maxBytesPerPartition: 1_048_576, // 1MB
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false,
    });

    try {
      await this.consumer.connect();
      await this.producer.connect();
      await this.consumer.subscribe({ topic: TOPIC, fromBeginning: false });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      this.connected = true;
      this.logger.log(
        `Kafka consumer connected, subscribed to ${TOPIC} (group: ${CONSUMER_GROUP})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to start Kafka consumer: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.consumer) {
        await this.consumer.disconnect();
      }
      if (this.producer) {
        await this.producer.disconnect();
      }
      this.connected = false;
      this.logger.log('Kafka consumer disconnected');
    } catch (error) {
      this.logger.error(`Error disconnecting consumer: ${(error as Error).message}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;
    const rawValue = message.value?.toString();

    if (!rawValue) {
      this.logger.warn('Received empty Kafka message, skipping');
      return;
    }

    let event: PayguruEnrichmentEvent;

    try {
      event = JSON.parse(rawValue) as PayguruEnrichmentEvent;
    } catch (err) {
      this.logger.error(`Failed to parse Payguru enrichment event: ${(err as Error).message}`);
      await this.sendToDlq(rawValue, 'JSON_PARSE_ERROR', (err as Error).message);
      return;
    }

    // Basic validation
    if (!event.msisdn || !event.merchantId || !event.requestId) {
      const errMsg = 'Missing required fields: msisdn, merchantId, or requestId';
      this.logger.error(`Invalid Payguru event: ${errMsg}`);
      await this.sendToDlq(rawValue, 'VALIDATION_ERROR', errMsg);
      return;
    }

    try {
      const portDate = event.portDate ? new Date(event.portDate) : undefined;

      const telcoResult = this.telcoIntelService.analyze({
        msisdn: event.msisdn,
        merchantId: event.merchantId,
        isPorted: event.isPorted,
        portDate,
        payguruLineType: event.lineType,
      });

      const signal: TelcoSignal = {
        requestId: event.requestId,
        msisdn: event.msisdn,
        merchantId: event.merchantId,
        operator: telcoResult.operator,
        lineType: telcoResult.lineType,
        isPorted: telcoResult.isPorted,
        portDate: event.portDate,
        prepaidProbability: telcoResult.prepaidProbability,
        countryCode: telcoResult.countryCode,
        processedAt: new Date().toISOString(),
      };

      await this.producer.send({
        topic: SIGNALS_TOPIC,
        messages: [
          {
            key: `${event.merchantId}:${event.msisdn}`,
            value: JSON.stringify(signal),
          },
        ],
      });

      this.logger.debug(
        `Published TelcoSignal for requestId=${event.requestId} msisdn=${event.msisdn}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to process Payguru enrichment event requestId=${event.requestId}: ` +
          `${(err as Error).message}`,
      );
      await this.sendToDlq(rawValue, 'PROCESSING_ERROR', (err as Error).message);
    }
  }

  private async sendToDlq(
    originalMessage: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.producer.send({
        topic: DLQ_TOPIC,
        messages: [
          {
            value: JSON.stringify({
              originalMessage,
              errorCode,
              errorMessage,
              failedAt: new Date().toISOString(),
            }),
          },
        ],
      });
      this.logger.warn(`Message routed to DLQ (${errorCode}): ${errorMessage}`);
    } catch (dlqErr) {
      this.logger.error(`Failed to send to DLQ: ${(dlqErr as Error).message}`);
    }
  }
}
