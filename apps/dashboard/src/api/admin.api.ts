import { api } from '../lib/api';
import type { AdminUser, ServiceHealth, Rule } from '../types/admin.types';

export async function fetchUsers(): Promise<AdminUser[]> {
  return api.get<AdminUser[]>('/api/v1/admin/users');
}

export async function inviteUser(email: string, role: string): Promise<AdminUser> {
  return api.post<AdminUser>('/api/v1/admin/users/invite', { email, role });
}

export async function deactivateUser(userId: string): Promise<void> {
  return api.delete<void>(`/api/v1/admin/users/${userId}`);
}

export async function fetchServiceHealth(): Promise<ServiceHealth[]> {
  return api.get<ServiceHealth[]>('/api/v1/admin/health');
}

export async function fetchRules(): Promise<Rule[]> {
  return api.get<Rule[]>('/api/v1/admin/rules');
}

export async function updateRuleWeight(ruleId: string, weight: number): Promise<Rule> {
  return api.patch<Rule>(`/api/v1/admin/rules/${ruleId}`, { weight });
}

export async function updateRuleExpression(ruleId: string, expression: string): Promise<Rule> {
  return api.patch<Rule>(`/api/v1/admin/rules/${ruleId}`, { expression });
}

export async function createRule(
  data: { name: string; expression: string; outcome: Rule['outcome']; weight: number; isActive: boolean },
): Promise<Rule> {
  return api.post<Rule>('/api/v1/admin/rules', data);
}

export async function deleteRule(ruleId: string): Promise<void> {
  return api.delete<void>(`/api/v1/admin/rules/${ruleId}`);
}

export async function toggleRuleActive(ruleId: string, isActive: boolean): Promise<Rule> {
  return api.patch<Rule>(`/api/v1/admin/rules/${ruleId}`, { isActive });
}
