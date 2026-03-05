import { create } from 'zustand';

export type DecisionAction = 'ALLOW' | 'REVIEW' | 'BLOCK';

export interface KpiData {
  decisionsPerHour: number;
  blockRatePct: number;
  reviewRatePct: number;
  avgLatencyMs: number;
}

export interface DecisionEvent {
  id: string;
  timestamp: string;
  entityId: string;
  action: DecisionAction;
  latencyMs: number;
}

export interface TrendBucket {
  minute: string;
  ALLOW: number;
  REVIEW: number;
  BLOCK: number;
}

interface DashboardState {
  kpi: KpiData;
  events: DecisionEvent[];
  trend: TrendBucket[];
  isLoading: boolean;
  setKpi: (kpi: KpiData) => void;
  prependEvent: (event: DecisionEvent) => void;
  setTrend: (trend: TrendBucket[]) => void;
  setLoading: (loading: boolean) => void;
}

const INITIAL_KPI: KpiData = {
  decisionsPerHour: 1247,
  blockRatePct: 3.2,
  reviewRatePct: 8.5,
  avgLatencyMs: 42,
};

function generateMockTrend(): TrendBucket[] {
  const now = new Date();
  return Array.from({ length: 60 }, (_, i) => {
    const d = new Date(now.getTime() - (59 - i) * 60 * 1000);
    const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const base = 15 + Math.round(10 * Math.sin(i / 8));
    return {
      minute: label,
      ALLOW: base + Math.round(Math.random() * 5),
      REVIEW: Math.round(base * 0.12 + Math.random() * 2),
      BLOCK: Math.round(base * 0.04 + Math.random()),
    };
  });
}

export const useDashboardStore = create<DashboardState>((set) => ({
  kpi: INITIAL_KPI,
  events: [],
  trend: generateMockTrend(),
  isLoading: false,

  setKpi: (kpi) => set({ kpi }),

  prependEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 50),
    })),

  setTrend: (trend) => set({ trend }),

  setLoading: (isLoading) => set({ isLoading }),
}));
