import type { Case } from '../types/case.types';
import type { CaseOutcome, LabelingStats } from '../types/fraud-ops.types';
import { getAuthHeader, getStoredToken } from '../lib/auth';

function getMerchantIdFromToken(): string {
  const token = getStoredToken();
  if (!token) return '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.merchant_id || payload.merchantId || payload.sub || '';
  } catch {
    return '';
  }
}

function withMerchantId(url: string): string {
  const merchantId = getMerchantIdFromToken();
  if (!merchantId) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}merchantId=${merchantId}`;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { ...getAuthHeader() } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json() as Promise<T>;
  }
  return undefined as unknown as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json() as Promise<T>;
  }
  return undefined as unknown as T;
}

export async function fetchReviewCases(baseUrl = '/api'): Promise<Case[]> {
  const url = withMerchantId(`${baseUrl}/v1/cases?status=OPEN&sort=riskScore:desc`);
  const result = await getJson<{ cases: Case[] } | Case[]>(url);
  return Array.isArray(result) ? result : result.cases ?? [];
}

export async function claimCase(caseId: string, baseUrl = '/api'): Promise<Case> {
  const url = withMerchantId(`${baseUrl}/v1/cases/${caseId}`);
  return patchJson<Case>(url, { status: 'IN_REVIEW' });
}

export async function submitOutcome(
  caseId: string,
  outcome: CaseOutcome,
  baseUrl = '/api',
): Promise<void> {
  const url = withMerchantId(`${baseUrl}/v1/cases/${caseId}`);
  await patchJson<void>(url, { status: 'RESOLVED', resolution: outcome });
  await postJson<void>(`${baseUrl}/v1/chargebacks`, {
    caseId,
    merchantId: getMerchantIdFromToken(),
    outcome,
    firedRuleIds: [],
    amount: 0,
  });
}

export async function fetchLabelingStats(_baseUrl = '/api'): Promise<LabelingStats> {
  // stats endpoint not yet implemented — return empty stats
  return {
    today: { labeled: 0, fraudConfirmed: 0, falsePositives: 0, inconclusive: 0, accuracy: 0 },
    pendingReview: 0,
  };
}

export async function bulkLabelCases(
  caseIds: string[],
  outcome: CaseOutcome,
  baseUrl = '/api',
): Promise<void> {
  const url = withMerchantId(`${baseUrl}/v1/cases/bulk`);
  await postJson<void>(url, { ids: caseIds, action: 'RESOLVE', resolution: outcome });
}
