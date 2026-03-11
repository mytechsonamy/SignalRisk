import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, Producer, EachMessagePayload, logLevel } from 'kafkajs';
import { CaseService } from '../cases/case.service';
import { DecisionEvent } from '../cases/case.types';
import { TOPICS } from '@signalrisk/kafka-config';

const TOPIC = TOPICS.DECISIONS;
const DLQ_TOPIC = `${TOPICS.DECISIONS}.dlq`;
const CONSUMER_GROUP = 'case-service-consumer';

@Injectable()
export class DecisionConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DecisionConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private producer: Producer;
  private connected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly caseService: CaseService,
  ) {
    const kafkaConfig = this.configService.get('kafka');
    const brokers: string[] = kafkaConfig?.brokers || ['localhost:9092'];
    const clientId: string = kafkaConfig?.clientId || 'case-service';
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
    });
    this.producer = this.kafka.producer();
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
    await this.producer.connect();
    await this.consumer.subscribe({ topic: TOPIC, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    this.connected = true;
    this.logger.log(`Decision consumer connected, subscribed to ${TOPIC}`);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.consumer.disconnect();
      await this.producer.disconnect();
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
      await this.sendToDlq(message.value.toString(), 'PARSE_ERROR', (err as Error).message);
      return;
    }

    // Validate required fields
    if (!decision.requestId || !decision.merchantId || !decision.action || !decision.entityId) {
      this.logger.warn(`Invalid decision event: missing required fields`);
      await this.sendToDlq(
        JSON.stringify(decision),
        'VALIDATION_ERROR',
        'Missing required fields: requestId, merchantId, action, entityId',
      );
      return;
    }

    // Only process REVIEW or BLOCK actions
    if (decision.action !== 'REVIEW' && decision.action !== 'BLOCK') {
      this.logger.debug(`Ignoring decision with action=${decision.action} (requestId=${decision.requestId})`);
      return;
    }

    try {
      const c = await this.caseService.createFromDecision(decision);
      this.logger.log(`Created case ${c.id} for decision ${decision.requestId}`);
    } catch (error) {
      this.logger.error(
        `Failed to create case for decision ${decision.requestId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      // Don't send to DLQ on service errors — allow retry on next poll
    }
  }

  private async sendToDlq(
    rawMessage: string,
    reason: string,
    detail: string,
  ): Promise<void> {
    try {
      await this.producer.send({
        topic: DLQ_TOPIC,
        messages: [
          {
            value: JSON.stringify({
              originalMessage: rawMessage,
              reason,
              detail,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      });
      this.logger.warn(`Sent message to DLQ (reason=${reason})`);
    } catch (dlqError) {
      this.logger.error(
        `Failed to send to DLQ: ${(dlqError as Error).message}`,
      );
    }
  }
}
