import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { GraphIntelService } from '../graph/graph-intel.service';
import { DeviceNode, SessionNode } from '../graph/graph.types';

const TOPIC = 'device-signals';
const GROUP_ID = 'graph-intel-service';

@Injectable()
export class DeviceSignalConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeviceSignalConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private connected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly graphIntelService: GraphIntelService,
  ) {
    const kafkaConfig = this.configService.get('kafka');
    const brokers = kafkaConfig?.brokers || ['localhost:9092'];
    const clientId = kafkaConfig?.clientId || 'graph-intel-service';
    const groupId = kafkaConfig?.groupId || GROUP_ID;

    this.kafka = new Kafka({
      clientId,
      brokers,
    });

    this.consumer = this.kafka.consumer({ groupId });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topic: TOPIC, fromBeginning: false });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      this.connected = true;
      this.logger.log(`Kafka consumer connected, subscribed to ${TOPIC}`);
    } catch (error) {
      this.logger.error(
        `Failed to start Kafka consumer: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.consumer.disconnect();
      this.connected = false;
      this.logger.log('Kafka consumer disconnected');
    } catch (error) {
      this.logger.error(`Error disconnecting consumer: ${(error as Error).message}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;
    if (!message.value) return;

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(message.value.toString());
    } catch {
      this.logger.warn('Failed to parse device-signal message, skipping');
      return;
    }

    const device: DeviceNode = {
      deviceId: data.deviceId as string,
      merchantId: data.merchantId as string,
      fingerprint: (data.fingerprint as string) || '',
      trustScore: (data.trustScore as number) || 0,
      isEmulator: (data.isEmulator as boolean) || false,
      firstSeenAt: (data.firstSeenAt as string) || new Date().toISOString(),
    };

    try {
      await this.graphIntelService.upsertDevice(device);
    } catch (error) {
      this.logger.error(
        `Failed to upsert device ${device.deviceId}: ${(error as Error).message}`,
      );
      return;
    }

    const sessionId = data.sessionId as string | undefined;
    if (sessionId) {
      const sessionNode: SessionNode = {
        sessionId,
        merchantId: device.merchantId,
        riskScore: (data.riskScore as number) || 0,
        isBot: (data.isBot as boolean) || false,
      };

      try {
        await this.graphIntelService.linkDeviceToSession(device.deviceId, sessionId, sessionNode);
      } catch (error) {
        this.logger.error(
          `Failed to link device ${device.deviceId} to session ${sessionId}: ${(error as Error).message}`,
        );
      }
    }
  }
}
