import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { KafkaProducerService, OutboxMessage } from '../kafka/kafka-producer.service';
import { DedupService } from './dedup.service';
import { resolveTopicForEvent } from './topic-router';

interface OutboxRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private shuttingDown = false;

  // Metrics
  private _lastPollTime: Date | null = null;
  private _eventsPublished = 0;

  constructor(
    private readonly pool: Pool,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly dedupService: DedupService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.startPolling();
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down outbox relay...');
    this.shuttingDown = true;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for current poll cycle to finish
    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    this.logger.log('Outbox relay shut down gracefully');
  }

  private startPolling(): void {
    const intervalMs = this.config.get<number>('relay.pollIntervalMs') ?? 500;
    this.logger.log(`Starting outbox relay polling (interval=${intervalMs}ms)`);
    this.scheduleNextPoll(intervalMs);
  }

  private scheduleNextPoll(intervalMs: number): void {
    if (this.shuttingDown) return;

    this.pollTimer = setTimeout(async () => {
      await this.pollOnce();
      this.scheduleNextPoll(intervalMs);
    }, intervalMs);
  }

  async pollOnce(): Promise<number> {
    if (this.running || this.shuttingDown) return 0;

    this.running = true;
    this._lastPollTime = new Date();

    try {
      const batchSize = this.config.get<number>('relay.batchSize') ?? 100;

      const result = await this.pool.query<OutboxRow>(
        `SELECT id, aggregate_type, aggregate_id, event_type, payload, created_at
         FROM outbox_events
         WHERE published_at IS NULL
         ORDER BY created_at ASC
         LIMIT $1`,
        [batchSize],
      );

      const rows = result.rows;
      if (rows.length === 0) {
        return 0;
      }

      this.logger.debug(`Polled ${rows.length} unpublished outbox event(s)`);

      // Build Kafka messages
      const messages: OutboxMessage[] = rows.map((row) => ({
        topic: resolveTopicForEvent(row.aggregate_type, row.event_type),
        key: this.dedupService.buildKafkaKey(row.id),
        value: JSON.stringify({
          id: row.id,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          eventType: row.event_type,
          payload: row.payload,
          createdAt: row.created_at.toISOString(),
        }),
        headers: {
          'outbox-event-id': row.id,
          'aggregate-type': row.aggregate_type,
          'event-type': row.event_type,
        },
      }));

      // Publish to Kafka
      await this.kafkaProducer.sendBatch(messages);

      // Mark as published
      const ids = rows.map((r) => r.id);
      await this.pool.query(
        `UPDATE outbox_events
         SET published_at = NOW()
         WHERE id = ANY($1::uuid[])`,
        [ids],
      );

      const now = new Date();
      this.dedupService.updateWatermark(now);
      this._eventsPublished += rows.length;

      this.logger.log(`Published and marked ${rows.length} outbox event(s)`);
      return rows.length;
    } catch (error) {
      this.logger.error('Outbox relay poll failed', (error as Error).stack);
      return 0;
    } finally {
      this.running = false;
    }
  }

  // --- Health metrics ---

  get lastPollTime(): Date | null {
    return this._lastPollTime;
  }

  get eventsPublished(): number {
    return this._eventsPublished;
  }

  get isRunning(): boolean {
    return this.running;
  }

  async getLag(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM outbox_events WHERE published_at IS NULL',
    );
    return parseInt(result.rows[0].count, 10);
  }
}
