import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';

export interface RetentionConfig {
  casesRetentionDays: number;
  devicesRetentionDays: number;
  purgeBatchSize: number;
}

@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);
  private readonly config: RetentionConfig;

  constructor(private readonly db: Pool, private readonly configService: ConfigService) {
    this.config = {
      casesRetentionDays: this.configService.get<number>('CASES_RETENTION_DAYS', 365),
      devicesRetentionDays: this.configService.get<number>('DEVICES_RETENTION_DAYS', 730),
      purgeBatchSize: this.configService.get<number>('PURGE_BATCH_SIZE', 1000),
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runRetentionJob(): Promise<{ purgedCases: number }> {
    this.logger.log('Starting scheduled data retention job');
    const purgedCases = await this.purgeOldCases();
    this.logger.log(`Retention job completed: purgedCases=${purgedCases}`);
    return { purgedCases };
  }

  async purgeOldCases(merchantId?: string): Promise<number> {
    const { casesRetentionDays, purgeBatchSize } = this.config;

    const conditions: string[] = [
      `status = 'RESOLVED'`,
      `updated_at < NOW() - INTERVAL '${casesRetentionDays} days'`,
      `deleted_at IS NULL`,
    ];
    const values: unknown[] = [purgeBatchSize];

    if (merchantId) {
      conditions.push(`merchant_id = $2`);
      values.push(merchantId);
    }

    const whereClause = conditions.join(' AND ');

    const client = await this.db.connect();
    try {
      const result = await client.query(
        `WITH rows_to_delete AS (
          SELECT id FROM cases
          WHERE ${whereClause}
          LIMIT $1
        )
        DELETE FROM cases WHERE id IN (SELECT id FROM rows_to_delete)`,
        values,
      );

      const purgedCount = result.rowCount ?? 0;

      if (purgedCount > 0) {
        await client.query(
          `INSERT INTO audit_log (action, details, created_at)
           VALUES ($1, $2, NOW())`,
          [
            'RETENTION_PURGE',
            JSON.stringify({
              purgedCases: purgedCount,
              retentionDays: casesRetentionDays,
              merchantId: merchantId ?? null,
              batchSize: purgeBatchSize,
            }),
          ],
        );

        this.logger.log(
          `Purged ${purgedCount} resolved cases older than ${casesRetentionDays} days` +
            (merchantId ? ` for merchant ${merchantId}` : ''),
        );
      }

      return purgedCount;
    } finally {
      client.release();
    }
  }
}
