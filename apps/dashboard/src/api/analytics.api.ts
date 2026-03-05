import type {
  DecisionTrend,
  VelocityPoint,
  RiskBucket,
  MerchantStat,
} from '../types/analytics.types';

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchTrends(
  days: 7 | 30,
  baseUrl = '/api',
): Promise<DecisionTrend[]> {
  return getJson<DecisionTrend[]>(`${baseUrl}/v1/analytics/trends?days=${days}`);
}

export async function fetchVelocity(baseUrl = '/api'): Promise<VelocityPoint[]> {
  return getJson<VelocityPoint[]>(`${baseUrl}/v1/analytics/velocity`);
}

export async function fetchRiskBuckets(baseUrl = '/api'): Promise<RiskBucket[]> {
  return getJson<RiskBucket[]>(`${baseUrl}/v1/analytics/risk-buckets`);
}

export async function fetchMerchantStats(baseUrl = '/api'): Promise<MerchantStat[]> {
  return getJson<MerchantStat[]>(`${baseUrl}/v1/analytics/merchants`);
}
