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
 *   device_id     TEXT,
 *   risk_score    NUMERIC(5,2) NOT NULL,
 *   decision      decision_outcome NOT NULL,
 *   risk_factors  JSONB NOT NULL DEFAULT '[]',
 *   signals       JSONB NOT NULL DEFAULT '{}',
 *   latency_ms    INTEGER NOT NULL,
 *   created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   is_test       BOOLEAN NOT NULL DEFAULT false
 * )
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DecisionResult } from './decision.types';
import { recordEntityProfileError, recordFeatureSnapshotError } from '@signalrisk/telemetry';

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
   * Writes entity_id + entity_type for typed prior-decision memory (ADR-009 + ADR-011).
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
           (request_id, merchant_id, device_id, entity_id, entity_type, risk_score, decision, risk_factors, signals, latency_ms, created_at, is_test)
         VALUES ($1, $2, $3, $4, $5, $6, $7::decision_outcome, $8::jsonb, $9::jsonb, $10, $11, $12)
         ON CONFLICT ON CONSTRAINT uq_decisions_merchant_request DO NOTHING`,
        [
          result.requestId,
          result.merchantId,
          (result as any).deviceId || null,
          (result as any).entityId || null,
          (result as any).entityType || null,
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
   * Prior-decision memory: count BLOCK and REVIEW decisions for a typed entity
   * within the last 30 days (ADR-011 + ADR-009).
   *
   * Guardrails:
   *  - 50ms timeout via statement_timeout (falls back to {0, 0})
   *  - 30-day MAX lookback
   *  - Uses idx_decisions_entity_type_created index (migration 013)
   *  - Falls back to device_id query for backward compat (pre-013 rows)
   */
  async getPriorDecisionMemory(
    merchantId: string,
    entityId: string,
    entityType: 'customer' | 'device' | 'ip' = 'customer',
  ): Promise<{ previousBlockCount30d: number; previousReviewCount7d: number }> {
    const fallback = { previousBlockCount30d: 0, previousReviewCount7d: 0 };
    let client: { query: (...args: any[]) => Promise<any>; release: () => void } | undefined;

    try {
      // Race against 50ms timeout
      const result = await Promise.race([
        (async () => {
          const conn = await this.pool.connect();
          client = conn;

          // Set 50ms statement timeout for this transaction
          await conn.query('SET LOCAL statement_timeout = 50');

          // RLS tenant isolation
          await conn.query("SELECT set_config('app.merchant_id', $1, true)", [merchantId]);

          const { rows } = await conn.query(
            `SELECT
               COUNT(*) FILTER (WHERE decision = 'BLOCK' AND created_at > NOW() - INTERVAL '30 days') AS block_count_30d,
               COUNT(*) FILTER (WHERE decision = 'REVIEW' AND created_at > NOW() - INTERVAL '7 days') AS review_count_7d
             FROM decisions
             WHERE merchant_id = $1
               AND entity_id = $2
               AND entity_type = $3
               AND created_at > NOW() - INTERVAL '30 days'`,
            [merchantId, entityId, entityType],
          );

          return {
            previousBlockCount30d: parseInt(rows[0]?.block_count_30d ?? '0', 10),
            previousReviewCount7d: parseInt(rows[0]?.review_count_7d ?? '0', 10),
          };
        })(),
        new Promise<typeof fallback>((resolve) =>
          setTimeout(() => {
            this.logger.warn(`Prior-decision memory timeout (50ms) for entity ${entityId}`);
            resolve(fallback);
          }, 50),
        ),
      ]);

      return result;
    } catch (err) {
      this.logger.warn(
        `Prior-decision memory failed for entity ${entityId}: ${(err as Error).message}`,
      );
      return fallback;
    } finally {
      client?.release();
    }
  }

  /**
   * Update entity profile on each decision (fire-and-forget).
   * UPSERT into entity_profiles — never blocks the decision flow.
   * Logs warn + increments counter on failure (AR-7).
   */
  async updateEntityProfile(
    merchantId: string,
    entityType: 'customer' | 'device' | 'ip',
    entityId: string,
  ): Promise<void> {
    let client;
    try {
      client = await this.pool.connect();
      await client.query("SELECT set_config('app.merchant_id', $1, true)", [merchantId]);

      await client.query(
        `INSERT INTO entity_profiles (merchant_id, entity_type, entity_id, first_seen_at, last_seen_at, total_tx_count)
         VALUES ($1, $2, $3, NOW(), NOW(), 1)
         ON CONFLICT (merchant_id, entity_type, entity_id)
         DO UPDATE SET last_seen_at = NOW(), total_tx_count = entity_profiles.total_tx_count + 1`,
        [merchantId, entityType, entityId],
      );
    } catch (err) {
      this.logger.warn(
        `Entity profile update failed for ${entityType}:${entityId}: ${(err as Error).message}`,
      );
      recordEntityProfileError({ entity_type: entityType, entity_id: entityId });
    } finally {
      client?.release();
    }
  }

  /**
   * Save feature snapshot for ML export and audit trail (P1-2).
   * Writes structured feature columns matching migration 009 schema.
   * Fire-and-forget: never blocks the decision flow.
   * Logs warn on failure (AR-6: feature_snapshot_write_errors_total).
   */
  async saveFeatureSnapshot(
    decisionId: string,
    merchantId: string,
    entityId: string,
    entityType: string,
    action: string,
    riskScore: number,
    signalBundle: {
      device?: { trustScore?: number; isEmulator?: boolean; daysSinceFirst?: number } | null;
      velocity?: { dimensions?: { txCount10m?: number; txCount1h?: number; txCount24h?: number; amountSum1h?: number; amountSum24h?: number; uniqueDevices24h?: number; uniqueIps24h?: number }; burstDetected?: boolean } | null;
      behavioral?: { sessionRiskScore?: number; isBot?: boolean; botProbability?: number } | null;
      network?: { riskScore?: number; isProxy?: boolean; isVpn?: boolean; isTor?: boolean; geoMismatchScore?: number } | null;
      telco?: { prepaidProbability?: number; isPorted?: boolean } | null;
      stateful?: { customer?: { previousBlockCount30d?: number; previousReviewCount7d?: number } } | null;
      [key: string]: unknown;
    },
  ): Promise<void> {
    let client;
    try {
      client = await this.pool.connect();
      await client.query("SELECT set_config('app.merchant_id', $1, true)", [merchantId]);

      await client.query(
        `INSERT INTO decision_feature_snapshots (
           decision_id, merchant_id, entity_id, entity_type, decision, risk_score,
           f_device_trust_score, f_device_is_emulator, f_device_days_since_first,
           f_velocity_tx_count_10m, f_velocity_tx_count_1h, f_velocity_tx_count_24h,
           f_velocity_amount_sum_1h, f_velocity_amount_sum_24h,
           f_velocity_unique_devices, f_velocity_unique_ips, f_velocity_burst_detected,
           f_behavioral_risk_score, f_behavioral_is_bot, f_behavioral_bot_prob,
           f_network_risk_score, f_network_is_proxy, f_network_is_vpn, f_network_is_tor, f_network_geo_mismatch,
           f_telco_prepaid_prob, f_telco_is_ported,
           f_stateful_prev_block_30d, f_stateful_prev_review_7d,
           signals_raw, created_at
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6,
           $7, $8, $9,
           $10, $11, $12, $13, $14, $15, $16, $17,
           $18, $19, $20,
           $21, $22, $23, $24, $25,
           $26, $27,
           $28, $29,
           $30::jsonb, NOW()
         )`,
        [
          decisionId, merchantId, entityId, entityType, action, riskScore,
          signalBundle.device?.trustScore ?? null,
          signalBundle.device?.isEmulator ?? null,
          signalBundle.device?.daysSinceFirst ?? null,
          signalBundle.velocity?.dimensions?.txCount10m ?? null,
          signalBundle.velocity?.dimensions?.txCount1h ?? null,
          signalBundle.velocity?.dimensions?.txCount24h ?? null,
          signalBundle.velocity?.dimensions?.amountSum1h ?? null,
          signalBundle.velocity?.dimensions?.amountSum24h ?? null,
          signalBundle.velocity?.dimensions?.uniqueDevices24h ?? null,
          signalBundle.velocity?.dimensions?.uniqueIps24h ?? null,
          signalBundle.velocity?.burstDetected ?? null,
          signalBundle.behavioral?.sessionRiskScore ?? null,
          signalBundle.behavioral?.isBot ?? null,
          signalBundle.behavioral?.botProbability ?? null,
          signalBundle.network?.riskScore ?? null,
          signalBundle.network?.isProxy ?? null,
          signalBundle.network?.isVpn ?? null,
          signalBundle.network?.isTor ?? null,
          signalBundle.network?.geoMismatchScore ?? null,
          signalBundle.telco?.prepaidProbability ?? null,
          signalBundle.telco?.isPorted ?? null,
          signalBundle.stateful?.customer?.previousBlockCount30d ?? null,
          signalBundle.stateful?.customer?.previousReviewCount7d ?? null,
          JSON.stringify(signalBundle),
        ],
      );
    } catch (err) {
      this.logger.warn(
        `Feature snapshot write failed for ${decisionId}: ${(err as Error).message}`,
      );
      recordFeatureSnapshotError({ decision_id: decisionId });
    } finally {
      client?.release();
    }
  }

  /**
   * Get the underlying connection pool (used by health checks).
   */
  getPool(): Pool {
    return this.pool;
  }
}
