import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  Case,
  CreateCaseData,
  UpdateCaseData,
  CaseListParams,
} from './case.types';

@Injectable()
export class CaseRepository {
  private readonly logger = new Logger(CaseRepository.name);

  constructor(private readonly pool: Pool) {}

  async create(data: CreateCaseData): Promise<Case> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.merchant_id', $1, true)", [data.merchantId]);

      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO cases (
          id, merchant_id, decision_id, entity_id, action, risk_score,
          risk_factors, status, priority, sla_deadline, assigned_to,
          resolution, resolution_notes, resolved_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, NOW(), NOW()
        )
        RETURNING *`,
        [
          id,
          data.merchantId,
          data.decisionId,
          data.entityId,
          data.action,
          data.riskScore,
          JSON.stringify(data.riskFactors),
          data.status,
          data.priority,
          data.slaDeadline,
          null,
          null,
          null,
          null,
        ],
      );

      return this.rowToCase(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async findById(id: string, merchantId: string): Promise<Case | null> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.merchant_id', $1, true)", [merchantId]);

      const result = await client.query(
        `SELECT * FROM cases WHERE id = $1 AND merchant_id = $2`,
        [id, merchantId],
      );

      if (result.rows.length === 0) return null;
      return this.rowToCase(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async findMany(
    params: CaseListParams,
  ): Promise<{ cases: Case[]; total: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.merchant_id', $1, true)", [
        params.merchantId,
      ]);

      const conditions: string[] = ['merchant_id = $1'];
      const values: unknown[] = [params.merchantId];
      let idx = 2;

      if (params.status) {
        conditions.push(`status = $${idx}`);
        values.push(params.status);
        idx++;
      }

      if (params.priority) {
        conditions.push(`priority = $${idx}`);
        values.push(params.priority);
        idx++;
      }

      if (params.assignedTo) {
        conditions.push(`assigned_to = $${idx}`);
        values.push(params.assignedTo);
        idx++;
      }

      if (params.search) {
        conditions.push(`entity_id ILIKE $${idx}`);
        values.push(`%${params.search}%`);
        idx++;
      }

      const where = conditions.join(' AND ');
      const limit = Math.min(params.limit, 100);
      const offset = (params.page - 1) * limit;

      const countResult = await client.query(
        `SELECT COUNT(*)::int AS total FROM cases WHERE ${where}`,
        values,
      );

      const dataResult = await client.query(
        `SELECT * FROM cases WHERE ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset],
      );

      return {
        cases: dataResult.rows.map((r) => this.rowToCase(r)),
        total: countResult.rows[0].total,
      };
    } finally {
      client.release();
    }
  }

  async update(
    id: string,
    merchantId: string,
    data: UpdateCaseData,
  ): Promise<Case | null> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.merchant_id', $1, true)", [merchantId]);

      const setClauses: string[] = ['updated_at = NOW()'];
      const values: unknown[] = [];
      let idx = 1;

      if (data.status !== undefined) {
        setClauses.push(`status = $${idx}`);
        values.push(data.status);
        idx++;
      }

      if (data.assignedTo !== undefined) {
        setClauses.push(`assigned_to = $${idx}`);
        values.push(data.assignedTo);
        idx++;
      }

      if (data.resolution !== undefined) {
        setClauses.push(`resolution = $${idx}`);
        values.push(data.resolution);
        idx++;
      }

      if (data.resolutionNotes !== undefined) {
        setClauses.push(`resolution_notes = $${idx}`);
        values.push(data.resolutionNotes);
        idx++;
      }

      if (data.resolvedAt !== undefined) {
        setClauses.push(`resolved_at = $${idx}`);
        values.push(data.resolvedAt);
        idx++;
      }

      values.push(id);
      values.push(merchantId);

      const result = await client.query(
        `UPDATE cases SET ${setClauses.join(', ')}
         WHERE id = $${idx} AND merchant_id = $${idx + 1}
         RETURNING *`,
        values,
      );

      if (result.rows.length === 0) return null;
      return this.rowToCase(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async bulkUpdate(
    ids: string[],
    merchantId: string,
    data: UpdateCaseData,
  ): Promise<number> {
    if (ids.length === 0) return 0;

    const client = await this.pool.connect();
    try {
      await client.query("SELECT set_config('app.merchant_id', $1, true)", [merchantId]);

      const setClauses: string[] = ['updated_at = NOW()'];
      const values: unknown[] = [];
      let idx = 1;

      if (data.status !== undefined) {
        setClauses.push(`status = $${idx}`);
        values.push(data.status);
        idx++;
      }

      if (data.assignedTo !== undefined) {
        setClauses.push(`assigned_to = $${idx}`);
        values.push(data.assignedTo);
        idx++;
      }

      if (data.resolution !== undefined) {
        setClauses.push(`resolution = $${idx}`);
        values.push(data.resolution);
        idx++;
      }

      if (data.resolutionNotes !== undefined) {
        setClauses.push(`resolution_notes = $${idx}`);
        values.push(data.resolutionNotes);
        idx++;
      }

      if (data.resolvedAt !== undefined) {
        setClauses.push(`resolved_at = $${idx}`);
        values.push(data.resolvedAt);
        idx++;
      }

      // Build placeholder list for ids
      const idPlaceholders = ids.map((_, i) => `$${idx + i}`).join(', ');
      values.push(...ids);
      idx += ids.length;

      values.push(merchantId);

      const result = await client.query(
        `UPDATE cases SET ${setClauses.join(', ')}
         WHERE id IN (${idPlaceholders}) AND merchant_id = $${idx}`,
        values,
      );

      return result.rowCount ?? 0;
    } finally {
      client.release();
    }
  }

  private rowToCase(row: Record<string, unknown>): Case {
    return {
      id: row.id as string,
      merchantId: row.merchant_id as string,
      decisionId: row.decision_id as string,
      entityId: row.entity_id as string,
      action: row.action as 'REVIEW' | 'BLOCK',
      riskScore: parseFloat(String(row.risk_score)),
      riskFactors: typeof row.risk_factors === 'string'
        ? JSON.parse(row.risk_factors as string)
        : (row.risk_factors as unknown[]) ?? [],
      status: row.status as Case['status'],
      priority: row.priority as Case['priority'],
      slaDeadline: new Date(row.sla_deadline as string),
      assignedTo: (row.assigned_to as string | null) ?? null,
      resolution: (row.resolution as Case['resolution']) ?? null,
      resolutionNotes: (row.resolution_notes as string | null) ?? null,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : null,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
