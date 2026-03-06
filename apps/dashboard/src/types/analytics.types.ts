export interface DecisionTrend {
  date: string; // 'YYYY-MM-DD'
  allow: number;
  review: number;
  block: number;
}

export interface VelocityPoint {
  hour: string; // 'HH:00'
  events: number;
}

export interface RiskBucket {
  range: string; // '0-10', '10-20', etc.
  count: number;
}

export interface MerchantStat {
  merchantId: string;
  name: string;
  eventVolume: number;
  avgRiskScore: number;
  blockRate: number; // 0-1
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

export interface AnalyticsData {
  trends: DecisionTrend[];     // last 7 days
  velocity: VelocityPoint[];   // last 24 hours
  riskBuckets: RiskBucket[];   // 10 buckets
  merchantStats: MerchantStat[];
  lastUpdated: Date;
}
