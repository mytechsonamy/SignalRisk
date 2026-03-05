import { create } from 'zustand';
import {
  fetchTrends,
  fetchVelocity,
  fetchRiskBuckets,
  fetchMerchantStats,
} from '../api/analytics.api';
import type { AnalyticsData } from '../types/analytics.types';

interface AnalyticsStore {
  data: AnalyticsData | null;
  isLoading: boolean;
  error: string | null;
  selectedPeriod: 7 | 30;
  activeTab: 'trends' | 'velocity' | 'merchants';
  setSelectedPeriod: (period: 7 | 30) => void;
  setActiveTab: (tab: 'trends' | 'velocity' | 'merchants') => void;
  fetchAnalytics: () => Promise<void>;
  startPolling: (intervalMs?: number) => () => void;
}

export const useAnalyticsStore = create<AnalyticsStore>((set, get) => ({
  data: null,
  isLoading: false,
  error: null,
  selectedPeriod: 7,
  activeTab: 'trends',

  setSelectedPeriod: (period) => {
    set({ selectedPeriod: period });
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },

  fetchAnalytics: async () => {
    set({ isLoading: true, error: null });
    try {
      const { selectedPeriod } = get();
      const [trends, velocity, riskBuckets, merchantStats] = await Promise.all([
        fetchTrends(selectedPeriod),
        fetchVelocity(),
        fetchRiskBuckets(),
        fetchMerchantStats(),
      ]);
      set({
        data: {
          trends,
          velocity,
          riskBuckets,
          merchantStats,
          lastUpdated: new Date(),
        },
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch analytics';
      set({ error: message, isLoading: false });
    }
  },

  startPolling: (intervalMs = 30_000) => {
    get().fetchAnalytics();
    const id = setInterval(() => {
      get().fetchAnalytics();
    }, intervalMs);
    return () => clearInterval(id);
  },
}));
