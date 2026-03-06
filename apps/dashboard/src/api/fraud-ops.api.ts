import type { Case } from '../types/case.types';
import type { CaseOutcome, LabelingStats } from '../types/fraud-ops.types';

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
  const result = await getJson<{ cases: Case[] } | Case[]>(`${baseUrl}/v1/cases?action=REVIEW&sort=riskScore:desc`);
  return Array.isArray(result) ? result : result.cases;
}

export async function claimCase(caseId: string, baseUrl = '/api'): Promise<Case> {
  return patchJson<Case>(`${baseUrl}/v1/cases/${caseId}`, { status: 'IN_REVIEW' });
}

export async function submitOutcome(
  caseId: string,
  outcome: CaseOutcome,
  baseUrl = '/api',
): Promise<void> {
  await patchJson<void>(`${baseUrl}/v1/cases/${caseId}`, { status: 'CLOSED', outcome });
  await postJson<void>(`${baseUrl}/v1/chargebacks`, {
    caseId,
    merchantId: '',
    outcome,
    firedRuleIds: [],
    amount: 0,
  });
}

export async function fetchLabelingStats(baseUrl = '/api'): Promise<LabelingStats> {
  return getJson<LabelingStats>(`${baseUrl}/v1/cases/stats`);
}

export async function bulkLabelCases(
  caseIds: string[],
  outcome: CaseOutcome,
  baseUrl = '/api',
): Promise<void> {
  await postJson<void>(`${baseUrl}/v1/cases/bulk`, { caseIds, action: 'close', outcome });
}
