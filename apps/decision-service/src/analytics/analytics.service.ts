import { Injectable, Logger } from '@nestjs/common';
import { DecisionStoreService } from '../decision/decision-store.service';

export interface DecisionTrend {
  date: string;
  allow: number;
  review: number;
  block: number;
}

export interface VelocityPoint {
  hour: string;
  events: number;
}

export interface RiskBucket {
  range: string;
  count: number;
}

export interface MerchantStat {
  merchantId: string;
  name: string;
  eventVolume: number;
  avgRiskScore: number;
  blockRate: number;
}

export interface KpiData {
  decisionsPerHour: number;
  blockRatePct: number;
  reviewRatePct: number;
  avgLatencyMs: number;
}

export interface TrendBucket {
  minute: string;
  ALLOW: number;
  REVIEW: number;
  BLOCK: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly store: DecisionStoreService) {}

  private get pool() {
    return this.store.getPool();
  }

  async getTrends(days: number): Promise<DecisionTrend[]> {
    const { rows } = await this.pool.query<{
      date: Date;
      allow: string;
      review: string;
      block: string;
    }>(
      `SELECT
         date_trunc('day', created_at)::date AS date,
         COUNT(*) FILTER (WHERE decision = 'ALLOW')  AS allow,
         COUNT(*) FILTER (WHERE decision = 'REVIEW') AS review,
         COUNT(*) FILTER (WHERE decision = 'BLOCK')  AS block
       FROM decisions
       WHERE created_at >= NOW() - make_interval(days => $1)
       GROUP BY 1
       ORDER BY 1`,
      [days],
    );

    return rows.map((r) => ({
      date: new Date(r.date).toISOString().slice(0, 10),
      allow: Number(r.allow),
      review: Number(r.review),
      block: Number(r.block),
    }));
  }

  async getVelocity(): Promise<VelocityPoint[]> {
    const { rows } = await this.pool.query<{ hour: Date; events: string }>(
      `SELECT
         date_trunc('hour', created_at) AS hour,
         COUNT(*) AS events
       FROM decisions
       WHERE created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY 1
       ORDER BY 1`,
    );

    return rows.map((r) => ({
      hour: new Date(r.hour).toISOString().slice(11, 16),
      events: Number(r.events),
    }));
  }

  async getRiskBuckets(): Promise<RiskBucket[]> {
    const { rows } = await this.pool.query<{ bucket: number; count: string }>(
      `SELECT
         width_bucket(risk_score, 0, 100, 10) AS bucket,
         COUNT(*) AS count
       FROM decisions
       WHERE created_at >= NOW() - INTERVAL '7 days'
       GROUP BY 1
       ORDER BY 1`,
    );

    const buckets: RiskBucket[] = [];
    for (let i = 1; i <= 10; i++) {
      const lo = (i - 1) * 10;
      const hi = i * 10;
      const row = rows.find((r) => Number(r.bucket) === i);
      buckets.push({
        range: `${lo}-${hi}`,
        count: row ? Number(row.count) : 0,
      });
    }
    return buckets;
  }

  async getMerchantStats(): Promise<MerchantStat[]> {
    const { rows } = await this.pool.query<{
      merchant_id: string;
      name: string;
      event_volume: string;
      avg_risk_score: string;
      block_rate: string;
    }>(
      `SELECT
         d.merchant_id,
         COALESCE(m.name, d.merchant_id::text) AS name,
         COUNT(*)::text AS event_volume,
         ROUND(AVG(d.risk_score), 1)::text AS avg_risk_score,
         ROUND(COUNT(*) FILTER (WHERE d.decision = 'BLOCK')::numeric / GREATEST(COUNT(*), 1), 3)::text AS block_rate
       FROM decisions d
       LEFT JOIN merchants m ON m.id = d.merchant_id
       WHERE d.created_at >= NOW() - INTERVAL '7 days'
       GROUP BY d.merchant_id, m.name
       ORDER BY event_volume DESC
       LIMIT 50`,
    );

    return rows.map((r) => ({
      merchantId: r.merchant_id,
      name: r.name,
      eventVolume: Number(r.event_volume),
      avgRiskScore: Number(r.avg_risk_score),
      blockRate: Number(r.block_rate),
    }));
  }

  async getKpi(): Promise<KpiData> {
    const { rows } = await this.pool.query<{
      total: string;
      blocks: string;
      reviews: string;
      avg_latency: string;
      hours_span: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE decision = 'BLOCK')::text AS blocks,
         COUNT(*) FILTER (WHERE decision = 'REVIEW')::text AS reviews,
         COALESCE(ROUND(AVG(latency_ms)), 0)::text AS avg_latency,
         GREATEST(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 3600, 1)::text AS hours_span
       FROM decisions
       WHERE created_at >= NOW() - INTERVAL '24 hours'`,
    );

    const r = rows[0];
    const total = Number(r?.total ?? 0);
    const hoursSpan = Number(r?.hours_span ?? 1);

    return {
      decisionsPerHour: Math.round(total / hoursSpan),
      blockRatePct: total > 0 ? Math.round((Number(r.blocks) / total) * 100) : 0,
      reviewRatePct: total > 0 ? Math.round((Number(r.reviews) / total) * 100) : 0,
      avgLatencyMs: Number(r?.avg_latency ?? 0),
    };
  }

  async getMinuteTrend(): Promise<TrendBucket[]> {
    const { rows } = await this.pool.query<{
      minute: Date;
      allow: string;
      review: string;
      block: string;
    }>(
      `SELECT
         date_trunc('minute', created_at) AS minute,
         COUNT(*) FILTER (WHERE decision = 'ALLOW')  AS allow,
         COUNT(*) FILTER (WHERE decision = 'REVIEW') AS review,
         COUNT(*) FILTER (WHERE decision = 'BLOCK')  AS block
       FROM decisions
       WHERE created_at >= NOW() - INTERVAL '60 minutes'
       GROUP BY 1
       ORDER BY 1`,
    );

    return rows.map((r) => ({
      minute: new Date(r.minute).toISOString().slice(11, 16),
      ALLOW: Number(r.allow),
      REVIEW: Number(r.review),
      BLOCK: Number(r.block),
    }));
  }
}
