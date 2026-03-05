import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { WeightAdjustment } from './chargeback.types';

@Injectable()
export class WeightAuditService {
  private readonly logger = new Logger(WeightAuditService.name);
  private readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    const connectionString = this.configService.get<string>(
      'DATABASE_URL',
      'postgresql://localhost:5432/signalrisk',
    );
    this.pool = new Pool({ connectionString });
  }

  async logAdjustment(adjustment: WeightAdjustment): Promise<void> {
    const sql = `
      INSERT INTO rule_weight_audit (rule_id, old_weight, new_weight, reason, case_id, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    await this.pool.query(sql, [
      adjustment.ruleId,
      adjustment.oldWeight,
      adjustment.newWeight,
      adjustment.reason,
      adjustment.caseId,
      adjustment.timestamp,
    ]);
    this.logger.debug(`Logged weight adjustment for rule=${adjustment.ruleId} case=${adjustment.caseId}`);
  }

  async getAuditLog(ruleId: string, limit = 20): Promise<WeightAdjustment[]> {
    const sql = `
      SELECT rule_id, old_weight, new_weight, reason, case_id, timestamp
      FROM rule_weight_audit
      WHERE rule_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;
    const result = await this.pool.query(sql, [ruleId, limit]);
    return result.rows.map((row) => ({
      ruleId: row.rule_id,
      oldWeight: parseFloat(row.old_weight),
      newWeight: parseFloat(row.new_weight),
      reason: row.reason as 'fraud_confirmed' | 'false_positive',
      caseId: row.case_id,
      timestamp: new Date(row.timestamp),
    }));
  }
}
