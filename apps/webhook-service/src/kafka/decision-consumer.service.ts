import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { TOPICS, CONSUMER_GROUPS } from '@signalrisk/kafka-config';
import { WebhookConfigService } from '../webhook/webhook-config.service';
import { WebhookDeliveryService } from '../webhook/webhook-delivery.service';
import { DecisionEvent, WebhookPayload } from '../webhook/webhook.types';

@Injectable()
export class DecisionConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DecisionConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private connected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly webhookConfigService: WebhookConfigService,
    private readonly webhookDeliveryService: WebhookDeliveryService,
  ) {
    const kafkaConfig = this.configService.get('kafka');
    const brokers: string[] = kafkaConfig?.brokers || ['localhost:9092'];
    const clientId: string = kafkaConfig?.clientId || 'webhook-service';
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
      groupId: kafkaConfig?.groupId || CONSUMER_GROUPS.WEBHOOK_DISPATCHER,
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
    });
  }

  async onModuleInit(): Promise<void> {
    this.connectConsumer().catch((error) => {
      this.logger.error(
        `Failed to start decision consumer: ${(error as Error).message}`,
        (error as Error).stack,
      );
    });
  }

  private async connectConsumer(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: TOPICS.DECISIONS, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    this.connected = true;
    this.logger.log(`Decision consumer connected, subscribed to ${TOPICS.DECISIONS}`);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.consumer.disconnect();
      this.connected = false;
      this.logger.log('Decision consumer disconnected');
    } catch (error) {
      this.logger.error(
        `Error disconnecting consumer: ${(error as Error).message}`,
      );
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;
    if (!message.value) return;

    let decision: DecisionEvent;
    try {
      decision = JSON.parse(message.value.toString()) as DecisionEvent;
    } catch (err) {
      this.logger.warn(`Failed to parse decision message: ${(err as Error).message}`);
      return;
    }

    // Skip test events — never send webhooks for fraud-tester traffic
    const isTest = message.headers?.['is-test']?.toString() === 'true'
      || (decision as any).isTest === true;
    if (isTest) {
      this.logger.debug(`Skipping webhook for test event (requestId=${decision.requestId})`);
      return;
    }

    // Only process BLOCK or REVIEW actions
    if (decision.action !== 'BLOCK' && decision.action !== 'REVIEW') {
      this.logger.debug(
        `Ignoring decision with action=${decision.action} (requestId=${decision.requestId})`,
      );
      return;
    }

    // Fetch webhook config for this merchant
    let webhookConfig;
    try {
      webhookConfig = await this.webhookConfigService.getWebhookConfig(decision.merchantId);
    } catch (err) {
      this.logger.error(
        `Failed to retrieve webhook config for merchant ${decision.merchantId}: ${(err as Error).message}`,
      );
      return;
    }

    if (!webhookConfig) {
      this.logger.debug(`No webhook config found for merchant ${decision.merchantId}, skipping`);
      return;
    }

    const webhookPayload: WebhookPayload = {
      event: decision.action === 'BLOCK' ? 'decision.block' : 'decision.review',
      requestId: decision.requestId,
      merchantId: decision.merchantId,
      outcome: decision.action,
      riskScore: decision.riskScore,
      timestamp: decision.timestamp || new Date().toISOString(),
    };

    try {
      await this.webhookDeliveryService.deliver(webhookConfig, webhookPayload);
    } catch (err) {
      this.logger.error(
        `Webhook delivery failed for merchant ${decision.merchantId}: ${(err as Error).message}`,
      );
    }
  }
}
