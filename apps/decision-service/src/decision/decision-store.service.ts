/**
 * SignalRisk Decision Service — Decision Store
 *
 * Persists decision results to PostgreSQL with RLS tenant isolation.
 * Gracefully degrades: if PG is unavailable, logs the error but allows
 * the decision flow to continue uninterrupted.
 *
 * Table: decisions (
 *   id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   request_id    TEXT NOT NULL,
 *   merchant_id   TEXT NOT NULL,
 *   action        TEXT NOT NULL,
 *   risk_score    INTEGER NOT NULL,
 *   risk_factors  JSONB NOT NULL,
 *   applied_rules TEXT[] NOT NULL,
 *   latency_ms    INTEGER NOT NULL,
 *   created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * )
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DecisionResult } from './decision.types';

@Injectable()
export class DecisionStoreService {
  private readonly logger = new Logger(DecisionStoreService.name);
  private readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    const dbConfig = this.configService.get('database');

    this.pool = new Pool({
      host:     dbConfig?.host     || 'localhost',
      port:     dbConfig?.port     || 5432,
      user:     dbConfig?.username || 'signalrisk',
      password: dbConfig?.password || 'signalrisk',
      database: dbConfig?.database || 'signalrisk',
      ssl:      dbConfig?.ssl ? { rejectUnauthorized: false } : false,
      max:      20,
      idleTimeoutMillis:    30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  /**
   * Persist a decision result.
   * Uses RLS set_config to enforce tenant isolation.
   * All errors are caught and logged — the decision flow is never blocked.
   */
  async save(result: DecisionResult): Promise<void> {
    let client;
    try {
      client = await this.pool.connect();

      // SET LOCAL for tenant isolation (RLS)
      await client.query("SELECT set_config('app.merchant_id', $1, true)", [result.merchantId]);

      await client.query(
        `INSERT INTO decisions
           (request_id, merchant_id, device_id, risk_score, decision, risk_factors, signals, latency_ms, created_at, is_test)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5::decision_outcome, $6::jsonb, $7::jsonb, $8, $9, $10)
         ON CONFLICT ON CONSTRAINT uq_decisions_merchant_request DO NOTHING`,
        [
          result.requestId,
          result.merchantId,
          (result as any).deviceId || null,
          result.riskScore ?? 0,
          result.action,
          JSON.stringify(result.riskFactors),
          JSON.stringify((result as any).signals || {}),
          result.latencyMs,
          result.createdAt,
          result.isTest ?? false,
        ],
      );

      this.logger.debug(
        `Saved decision ${result.requestId} for merchant ${result.merchantId}: ${result.action}`,
      );
    } catch (err) {
      // Graceful degradation — log but do not re-throw
      this.logger.error(
        `Failed to persist decision ${result.requestId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      client?.release();
    }
  }

  /**
   * Find a decision by request_id (across all merchants — no RLS).
   */
  async findByRequestId(requestId: string): Promise<DecisionResult | null> {
    try {
      const { rows } = await this.pool.query(
        `SELECT request_id, merchant_id, device_id, risk_score, decision, risk_factors, signals, latency_ms, created_at, is_test
         FROM decisions WHERE request_id = $1 LIMIT 1`,
        [requestId],
      );
      if (rows.length === 0) return null;
      const row = rows[0];
      return {
        requestId: row.request_id,
        merchantId: row.merchant_id,
        action: row.decision,
        riskScore: Number(row.risk_score) || 0,
        riskFactors: row.risk_factors ?? [],
        appliedRules: [],
        latencyMs: row.latency_ms,
        cached: false,
        createdAt: row.created_at,
        isTest: row.is_test,
      };
    } catch (err) {
      this.logger.error(`findByRequestId failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Get the underlying connection pool (used by health checks).
   */
  getPool(): Pool {
    return this.pool;
  }
}
