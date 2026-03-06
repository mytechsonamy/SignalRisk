import { api } from '../lib/api';
import type { BattleReport, BattleConfig } from '../types/fraud-tester.types';

export const fraudTesterApi = {
  getBattles: () => api.get<BattleReport[]>('/v1/fraud-tester/battles'),
  getBattle: (id: string) => api.get<BattleReport>(`/v1/fraud-tester/battles/${id}`),
  startBattle: (config: BattleConfig) =>
    api.post<{ battleId: string }>('/v1/fraud-tester/battles', config),
  stopBattle: (id: string) =>
    api.post<void>(`/v1/fraud-tester/battles/${id}/stop`, {}),
  healthCheck: () =>
    api.get<{ status: string; latencyMs: number }>('/v1/fraud-tester/health'),
};
