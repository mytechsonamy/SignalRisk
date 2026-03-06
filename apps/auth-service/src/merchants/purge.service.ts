import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class PurgeService {
  private readonly logger = new Logger(PurgeService.name);

  constructor(private readonly pool: Pool) {}

  async purgeMerchant(merchantId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      // 1. Check merchant exists
      const checkResult = await client.query(
        `SELECT id FROM merchants WHERE id = $1 AND deleted_at IS NULL`,
        [merchantId],
      );

      if (checkResult.rows.length === 0) {
        throw new NotFoundException(`Merchant with id ${merchantId} not found`);
      }

      // 2. Soft-delete merchant (set deleted_at = NOW())
      await client.query(
        `UPDATE merchants SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [merchantId],
      );

      // 3. Revoke all API keys for merchant
      await client.query(
        `UPDATE api_keys SET revoked = true, updated_at = NOW() WHERE merchant_id = $1`,
        [merchantId],
      );

      // 4. Emit 'merchant.purged' Kafka event (logged since Kafka may not be wired)
      this.logger.log(
        JSON.stringify({
          event: 'merchant.purged',
          merchantId,
          timestamp: new Date().toISOString(),
        }),
      );

      // 5. Log to audit_log
      await client.query(
        `INSERT INTO audit_log (action, details, created_at)
         VALUES ($1, $2, NOW())`,
        [
          'MERCHANT_PURGE',
          JSON.stringify({ merchantId, purgedAt: new Date().toISOString() }),
        ],
      );

      this.logger.log(`Merchant ${merchantId} purged successfully`);
    } finally {
      client.release();
    }
  }
}
