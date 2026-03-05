import type { AdminUser, ServiceHealth, Rule } from '../types/admin.types';

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
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
  return response.json() as Promise<T>;
}

async function deleteRequest(url: string): Promise<void> {
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

export async function fetchUsers(baseUrl = '/api'): Promise<AdminUser[]> {
  return getJson<AdminUser[]>(`${baseUrl}/v1/admin/users`);
}

export async function inviteUser(
  email: string,
  role: string,
  baseUrl = '/api',
): Promise<AdminUser> {
  return postJson<AdminUser>(`${baseUrl}/v1/admin/users/invite`, { email, role });
}

export async function deactivateUser(userId: string, baseUrl = '/api'): Promise<void> {
  return deleteRequest(`${baseUrl}/v1/admin/users/${userId}`);
}

export async function fetchServiceHealth(baseUrl = '/api'): Promise<ServiceHealth[]> {
  return getJson<ServiceHealth[]>(`${baseUrl}/v1/admin/health`);
}

export async function fetchRules(baseUrl = '/api'): Promise<Rule[]> {
  return getJson<Rule[]>(`${baseUrl}/v1/admin/rules`);
}

export async function updateRuleWeight(
  ruleId: string,
  weight: number,
  baseUrl = '/api',
): Promise<Rule> {
  return patchJson<Rule>(`${baseUrl}/v1/admin/rules/${ruleId}`, { weight });
}

export async function updateRuleExpression(
  ruleId: string,
  expression: string,
  baseUrl = '/api',
): Promise<Rule> {
  return patchJson<Rule>(`${baseUrl}/v1/admin/rules/${ruleId}`, { expression });
}
