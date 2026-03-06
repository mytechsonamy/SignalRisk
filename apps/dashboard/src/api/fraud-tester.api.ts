import { api } from '../lib/api';
import type { BattleReport, BattleConfig } from '../types/fraud-tester.types';

export const fraudTesterApi = {
  getBattles: () => api.get<BattleReport[]>('/v1/fraud-tester/battles'),
  getBattle: (id: string) => api.get<BattleReport>(`/v1/fraud-tester/battles/${id}`),
  startBattle: (config: BattleConfig) =>
    api.post<{ battleId: string }>('/v1/fraud-tester/battles', config),
  stopBattle: (id: string) =>
    api.post<void>(`/v1/fraud-tester/battles/${id}/stop`, {}),
  healthCheck: (baseUrl?: string, apiKey?: string) => {
    if (baseUrl) {
      // Direct fetch to a custom target's health endpoint
      return fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(5000),
      })
        .then((res) => res.ok)
        .catch(() => false);
    }
    return api.get<{ status: string; latencyMs: number }>('/v1/fraud-tester/health');
  },
};
