import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAnalyticsStore } from '../store/analytics.store';
import * as analyticsApi from '../api/analytics.api';

vi.mock('../api/analytics.api');

const mockTrends = [
  { date: '2026-03-01', allow: 100, review: 20, block: 5 },
  { date: '2026-03-02', allow: 120, review: 18, block: 3 },
];

const mockVelocity = [
  { hour: '00:00', events: 45 },
  { hour: '01:00', events: 32 },
];

const mockRiskBuckets = [
  { range: '0-10', count: 50 },
  { range: '10-20', count: 80 },
];

const mockMerchants = [
  { merchantId: 'm1', name: 'Acme Corp', eventVolume: 500, avgRiskScore: 35, blockRate: 0.05 },
];

describe('useAnalyticsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to initial state between tests
    useAnalyticsStore.setState({
      data: null,
      isLoading: false,
      error: null,
      selectedPeriod: 7,
      activeTab: 'trends',
    });
  });

  it('has correct initial state', () => {
    const state = useAnalyticsStore.getState();
    expect(state.data).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.selectedPeriod).toBe(7);
    expect(state.activeTab).toBe('trends');
  });

  it('setSelectedPeriod updates selectedPeriod', () => {
    const { setSelectedPeriod } = useAnalyticsStore.getState();
    setSelectedPeriod(30);
    expect(useAnalyticsStore.getState().selectedPeriod).toBe(30);
  });

  it('setActiveTab updates activeTab', () => {
    const { setActiveTab } = useAnalyticsStore.getState();
    setActiveTab('velocity');
    expect(useAnalyticsStore.getState().activeTab).toBe('velocity');
  });

  it('setActiveTab can switch to merchants', () => {
    const { setActiveTab } = useAnalyticsStore.getState();
    setActiveTab('merchants');
    expect(useAnalyticsStore.getState().activeTab).toBe('merchants');
  });

  it('fetchAnalytics populates data on success', async () => {
    vi.mocked(analyticsApi.fetchTrends).mockResolvedValue(mockTrends);
    vi.mocked(analyticsApi.fetchVelocity).mockResolvedValue(mockVelocity);
    vi.mocked(analyticsApi.fetchRiskBuckets).mockResolvedValue(mockRiskBuckets);
    vi.mocked(analyticsApi.fetchMerchantStats).mockResolvedValue(mockMerchants);

    await useAnalyticsStore.getState().fetchAnalytics();

    const state = useAnalyticsStore.getState();
    expect(state.data).not.toBeNull();
    expect(state.data!.trends).toEqual(mockTrends);
    expect(state.data!.velocity).toEqual(mockVelocity);
    expect(state.data!.riskBuckets).toEqual(mockRiskBuckets);
    expect(state.data!.merchantStats).toEqual(mockMerchants);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('fetchAnalytics sets error state on API failure', async () => {
    vi.mocked(analyticsApi.fetchTrends).mockRejectedValue(new Error('Network error'));
    vi.mocked(analyticsApi.fetchVelocity).mockResolvedValue([]);
    vi.mocked(analyticsApi.fetchRiskBuckets).mockResolvedValue([]);
    vi.mocked(analyticsApi.fetchMerchantStats).mockResolvedValue([]);

    await useAnalyticsStore.getState().fetchAnalytics();

    const state = useAnalyticsStore.getState();
    expect(state.error).toBe('Network error');
    expect(state.isLoading).toBe(false);
    expect(state.data).toBeNull();
  });

  it('fetchAnalytics uses selectedPeriod when calling fetchTrends', async () => {
    vi.mocked(analyticsApi.fetchTrends).mockResolvedValue(mockTrends);
    vi.mocked(analyticsApi.fetchVelocity).mockResolvedValue(mockVelocity);
    vi.mocked(analyticsApi.fetchRiskBuckets).mockResolvedValue(mockRiskBuckets);
    vi.mocked(analyticsApi.fetchMerchantStats).mockResolvedValue(mockMerchants);

    useAnalyticsStore.getState().setSelectedPeriod(30);
    await useAnalyticsStore.getState().fetchAnalytics();

    expect(analyticsApi.fetchTrends).toHaveBeenCalledWith(30);
  });

  it('startPolling returns a cleanup function', () => {
    vi.mocked(analyticsApi.fetchTrends).mockResolvedValue([]);
    vi.mocked(analyticsApi.fetchVelocity).mockResolvedValue([]);
    vi.mocked(analyticsApi.fetchRiskBuckets).mockResolvedValue([]);
    vi.mocked(analyticsApi.fetchMerchantStats).mockResolvedValue([]);

    const cleanup = useAnalyticsStore.getState().startPolling(60_000);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });
});
