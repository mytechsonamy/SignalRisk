import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

/**
 * Tracks the last successfully published outbox event to avoid
 * re-publishing on restart. Uses published_at watermark from the DB
 * rather than in-memory state so it survives restarts.
 */
@Injectable()
export class DedupService implements OnModuleInit {
  private readonly logger = new Logger(DedupService.name);
  private lastPublishedAt: Date | null = null;

  constructor(private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.loadWatermark();
  }

  /**
   * On startup, determine the high-water mark from the DB
   * so we only pick up truly unpublished rows.
   */
  async loadWatermark(): Promise<void> {
    const result = await this.pool.query<{ max_published: Date | null }>(
      'SELECT MAX(published_at) AS max_published FROM outbox_events',
    );
    this.lastPublishedAt = result.rows[0]?.max_published ?? null;
    this.logger.log(
      `Watermark loaded: ${this.lastPublishedAt?.toISOString() ?? 'none (first run)'}`,
    );
  }

  /**
   * Check if an outbox event has already been published.
   * We rely on the published_at column in the DB query (WHERE published_at IS NULL)
   * so this is a secondary safety net using the event ID as Kafka message key.
   */
  buildKafkaKey(outboxEventId: string): string {
    return outboxEventId;
  }

  getLastPublishedAt(): Date | null {
    return this.lastPublishedAt;
  }

  updateWatermark(publishedAt: Date): void {
    if (!this.lastPublishedAt || publishedAt > this.lastPublishedAt) {
      this.lastPublishedAt = publishedAt;
    }
  }
}
