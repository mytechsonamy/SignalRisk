import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class CaseExportService {
  constructor(@Inject('PG_POOL') private readonly db: Pool) {}

  async exportEntityCases(merchantId: string, entityId: string): Promise<any[]> {
    const client = await this.db.connect();
    try {
      await client.query("SELECT set_config('app.merchant_id', $1, true)", [merchantId]);
      const res = await client.query(
        'SELECT * FROM cases WHERE entity_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC',
        [merchantId, entityId],
      );
      return res.rows;
    } finally {
      client.release();
    }
  }
}
