import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';

const DEFAULT_RETENTION_DAYS = 730;
const DEFAULT_BATCH_SIZE = 500;

@Injectable()
export class DeviceRetentionService {
  private readonly logger = new Logger(DeviceRetentionService.name);
  private readonly retentionDays: number;
  private readonly batchSize: number;

  constructor(private readonly pool: Pool, private readonly configService: ConfigService) {
    this.retentionDays = this.configService.get<number>(
      'DEVICES_RETENTION_DAYS',
      DEFAULT_RETENTION_DAYS,
    );
    this.batchSize = this.configService.get<number>('PURGE_BATCH_SIZE', DEFAULT_BATCH_SIZE);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runRetentionJob(): Promise<{ purgedDevices: number }> {
    this.logger.log('Starting device retention job');
    const purgedDevices = await this.purgeOldDevices();
    this.logger.log(`Device retention job completed: purgedDevices=${purgedDevices}`);
    return { purgedDevices };
  }

  async purgeOldDevices(merchantId?: string): Promise<number> {
    const conditions: string[] = [
      `last_seen_at < NOW() - INTERVAL '${this.retentionDays} days'`,
      `deleted_at IS NULL`,
    ];
    const values: unknown[] = [this.batchSize];

    if (merchantId) {
      conditions.push(`merchant_id = $2`);
      values.push(merchantId);
    }

    const whereClause = conditions.join(' AND ');

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `WITH rows_to_delete AS (
          SELECT id FROM devices
          WHERE ${whereClause}
          LIMIT $1
        )
        DELETE FROM devices WHERE id IN (SELECT id FROM rows_to_delete)`,
        values,
      );

      const purgedCount = result.rowCount ?? 0;

      if (purgedCount > 0) {
        this.logger.log(
          `Purged ${purgedCount} devices not seen in ${this.retentionDays} days` +
            (merchantId ? ` for merchant ${merchantId}` : ''),
        );
      }

      return purgedCount;
    } finally {
      client.release();
    }
  }
}
