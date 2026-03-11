import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { Pool } from 'pg';
import { TOPICS, CONSUMER_GROUPS } from '@signalrisk/kafka-config';

interface LabelEvent {
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
export class StateFeedbackConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StateFeedbackConsumer.name);
  private consumer: Consumer;
  private connected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly pool: Pool,
  ) {
    const kafkaConfig = this.configService.get('kafka');
    const brokers: string[] = kafkaConfig?.brokers || ['localhost:9092'];
    const clientId: string = kafkaConfig?.clientId || 'decision-service-feedback';
    const ssl: boolean = kafkaConfig?.ssl || false;

    const kafka = new Kafka({
      clientId,
      brokers,
      ssl,
      logLevel: logLevel.ERROR,
      retry: { initialRetryTime: 300, retries: 10 },
    });

    this.consumer = kafka.consumer({
      groupId: CONSUMER_GROUPS.STATE_LABELS,
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
    });
  }

  async onModuleInit(): Promise<void> {
    this.connectConsumer().catch((err) => {
      this.logger.error(`Failed to start feedback consumer: ${(err as Error).message}`);
    });
  }

  private async connectConsumer(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: TOPICS.STATE_LABELS, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    this.connected = true;
    this.logger.log(`Feedback consumer connected, subscribed to ${TOPICS.STATE_LABELS}`);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.consumer.disconnect();
      this.connected = false;
    } catch (err) {
      this.logger.error(`Error disconnecting feedback consumer: ${(err as Error).message}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;
    if (!message.value) return;

    let event: LabelEvent;
    try {
      event = JSON.parse(message.value.toString()) as LabelEvent;
    } catch (err) {
      this.logger.warn(`Failed to parse label event: ${(err as Error).message}`);
      return;
    }

    if (!event.merchantId || !event.entityId || !event.resolution) {
      this.logger.warn('Invalid label event: missing required fields');
      return;
    }

    const entityType = event.entityType || 'customer';

    let client: any;
    try {
      client = await this.pool.connect();
      await client.query("SELECT set_config('app.merchant_id', $1, true)", [event.merchantId]);

      switch (event.resolution) {
        case 'FRAUD':
          await this.handleFraudLabel(client, event, entityType);
          break;
        case 'LEGITIMATE':
          await this.handleLegitimateLabel(client, event, entityType);
          break;
        case 'INCONCLUSIVE':
          this.logger.debug(`Inconclusive label for case ${event.caseId} — no enforcement action`);
          break;
      }

      this.logger.log(
        `Processed label: caseId=${event.caseId} resolution=${event.resolution} entityType=${entityType} entityId=${event.entityId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to process label event for case ${event.caseId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      client?.release();
    }
  }

  private async handleFraudLabel(
    client: any,
    event: LabelEvent,
    entityType: string,
  ): Promise<void> {
    // UPSERT denylist entry
    await client.query(
      `INSERT INTO watchlist_entries (merchant_id, entity_type, entity_id, list_type, source, reason, is_active, created_at)
       VALUES ($1, $2, $3, 'denylist', 'auto_fraud', $4, true, NOW())
       ON CONFLICT (merchant_id, entity_type, entity_id, list_type)
       DO UPDATE SET is_active = true, reason = EXCLUDED.reason, updated_at = NOW()`,
      [
        event.merchantId,
        entityType,
        event.entityId,
        `Analyst confirmed fraud (case ${event.caseId})`,
      ],
    );

    // UPSERT entity_profiles (mark as fraud confirmed)
    await client.query(
      `INSERT INTO entity_profiles (merchant_id, entity_type, entity_id, is_fraud_confirmed, first_seen_at, last_seen_at, total_tx_count)
       VALUES ($1, $2, $3, true, NOW(), NOW(), 0)
       ON CONFLICT (merchant_id, entity_type, entity_id)
       DO UPDATE SET is_fraud_confirmed = true, last_seen_at = NOW()`,
      [event.merchantId, entityType, event.entityId],
    );
  }

  private async handleLegitimateLabel(
    client: any,
    event: LabelEvent,
    entityType: string,
  ): Promise<void> {
    // Deactivate denylist entry
    await client.query(
      `UPDATE watchlist_entries SET is_active = false, updated_at = NOW()
       WHERE merchant_id = $1 AND entity_type = $2 AND entity_id = $3 AND list_type = 'denylist'`,
      [event.merchantId, entityType, event.entityId],
    );

    // Insert allowlist with 30-day cooldown (ADR-012 / FD-2)
    await client.query(
      `INSERT INTO watchlist_entries (merchant_id, entity_type, entity_id, list_type, source, reason, is_active, expires_at, created_at)
       VALUES ($1, $2, $3, 'allowlist', 'auto_legitimate', $4, true, NOW() + INTERVAL '30 days', NOW())
       ON CONFLICT (merchant_id, entity_type, entity_id, list_type)
       DO UPDATE SET is_active = true, reason = EXCLUDED.reason, expires_at = NOW() + INTERVAL '30 days', updated_at = NOW()`,
      [
        event.merchantId,
        entityType,
        event.entityId,
        `Analyst confirmed legitimate (case ${event.caseId})`,
      ],
    );

    // UPSERT entity_profiles (mark as not fraud)
    await client.query(
      `INSERT INTO entity_profiles (merchant_id, entity_type, entity_id, is_fraud_confirmed, first_seen_at, last_seen_at, total_tx_count)
       VALUES ($1, $2, $3, false, NOW(), NOW(), 0)
       ON CONFLICT (merchant_id, entity_type, entity_id)
       DO UPDATE SET is_fraud_confirmed = false, last_seen_at = NOW()`,
      [event.merchantId, entityType, event.entityId],
    );
  }
}
