/**
 * SignalRisk Device Intel — Kafka Consumer
 *
 * Consumes raw events from signalrisk.events.raw, filters for those
 * with device attributes, identifies or updates the device, and
 * maintains idempotency via the processed_events table.
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { Pool } from 'pg';
import { FingerprintService } from '../fingerprint/fingerprint.service';

const TOPIC = 'signalrisk.events.raw';
const CONSUMER_GROUP = 'signalrisk.cg.device-intel';

@Injectable()
export class DeviceEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeviceEventConsumer.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private pool: Pool;
  private connected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly fingerprintService: FingerprintService,
  ) {
    const kafkaConfig = this.configService.get('kafka');
    const brokers = kafkaConfig?.brokers || ['localhost:9092'];
    const clientId = kafkaConfig?.clientId || 'device-intel-service';
    const ssl = kafkaConfig?.ssl || false;

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

    const dbConfig = this.configService.get('database');
    this.pool = new Pool({
      host: dbConfig?.host || 'localhost',
      port: dbConfig?.port || 5432,
      user: dbConfig?.username || 'signalrisk',
      password: dbConfig?.password || 'signalrisk',
      database: dbConfig?.database || 'signalrisk',
      ssl: dbConfig?.ssl ? { rejectUnauthorized: false } : false,
      max: 5,
    });
  }

  async onModuleInit(): Promise<void> {
    this.connectConsumer().catch((error) => {
      this.logger.error(
        `Failed to start Kafka consumer: ${(error as Error).message}`,
        (error as Error).stack,
      );
    });
  }

  private async connectConsumer(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: TOPIC, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    this.connected = true;
    this.logger.log(`Kafka consumer connected, subscribed to ${TOPIC}`);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.consumer.disconnect();
      await this.pool.end();
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
    if (!message.value) return;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(message.value.toString());
    } catch {
      this.logger.warn('Failed to parse message, skipping');
      return;
    }

    const eventId = event.eventId as string;
    if (!eventId) return;

    // Idempotency check
    if (await this.isAlreadyProcessed(eventId)) {
      this.logger.debug(`Event ${eventId} already processed, skipping`);
      return;
    }

    // Only process events that have device-relevant data
    const merchantId = event.merchantId as string;
    const deviceFingerprint = event.deviceFingerprint as string | undefined;
    const metadata = event.metadata as Record<string, unknown> | undefined;

    if (!merchantId) return;

    // If there's a device fingerprint in the event, do a simple last_seen update
    // If there are full device attributes in metadata, do a full identify
    if (metadata && this.hasDeviceAttributes(metadata)) {
      try {
        const attrs = this.extractDeviceAttributes(metadata);
        await this.fingerprintService.identify(merchantId, attrs);
      } catch (error) {
        this.logger.error(
          `Failed to identify device for event ${eventId}: ${(error as Error).message}`,
        );
        // Don't mark as processed — allow retry
        return;
      }
    } else if (deviceFingerprint) {
      // Minimal update — just touching last_seen_at via fuzzyMatch
      try {
        await this.fingerprintService.fuzzyMatch(deviceFingerprint, merchantId);
      } catch (error) {
        this.logger.warn(
          `Failed to match fingerprint for event ${eventId}: ${(error as Error).message}`,
        );
      }
    } else {
      // No device data in this event — skip
      return;
    }

    // Mark as processed
    await this.markProcessed(eventId);
  }

  private hasDeviceAttributes(metadata: Record<string, unknown>): boolean {
    return !!(
      metadata.screenResolution &&
      metadata.gpuRenderer &&
      metadata.timezone &&
      metadata.webglHash &&
      metadata.canvasHash &&
      metadata.platform
    );
  }

  private extractDeviceAttributes(metadata: Record<string, unknown>) {
    return {
      screenResolution: metadata.screenResolution as string,
      gpuRenderer: metadata.gpuRenderer as string,
      timezone: metadata.timezone as string,
      language: (metadata.language as string) || 'en',
      fonts: metadata.fonts as string[] | undefined,
      webglHash: metadata.webglHash as string,
      canvasHash: metadata.canvasHash as string,
      audioHash: metadata.audioHash as string | undefined,
      androidId: metadata.androidId as string | undefined,
      playIntegrityToken: metadata.playIntegrityToken as string | undefined,
      sensorNoise: metadata.sensorNoise as number[] | undefined,
      platform: metadata.platform as 'web' | 'android',
    };
  }

  private async isAlreadyProcessed(eventId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT 1 FROM processed_events WHERE event_id = $1 AND consumer_group = $2`,
        [eventId, CONSUMER_GROUP],
      );
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }

  private async markProcessed(eventId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO processed_events (event_id, consumer_group, processed_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (event_id, consumer_group) DO NOTHING`,
        [eventId, CONSUMER_GROUP],
      );
    } finally {
      client.release();
    }
  }
}
