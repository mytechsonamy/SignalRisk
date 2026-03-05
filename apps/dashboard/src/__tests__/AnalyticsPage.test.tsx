import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AnalyticsPage from '../pages/AnalyticsPage';
import { useAnalyticsStore } from '../store/analytics.store';
import type { AnalyticsData } from '../types/analytics.types';

vi.mock('../store/analytics.store');

const mockData: AnalyticsData = {
  trends: [
    { date: '2026-03-01', allow: 100, review: 20, block: 5 },
    { date: '2026-03-02', allow: 120, review: 18, block: 3 },
  ],
  velocity: [
    { hour: '00:00', events: 45 },
    { hour: '01:00', events: 32 },
  ],
  riskBuckets: [
    { range: '0-10', count: 120 },
    { range: '10-20', count: 200 },
    { range: '20-30', count: 180 },
    { range: '30-40', count: 150 },
    { range: '40-50', count: 100 },
    { range: '50-60', count: 80 },
    { range: '60-70', count: 60 },
    { range: '70-80', count: 40 },
    { range: '80-90', count: 20 },
    { range: '90-100', count: 10 },
  ],
  merchantStats: [
    { merchantId: 'm1', name: 'Acme Corp', eventVolume: 500, avgRiskScore: 35, blockRate: 0.05 },
  ],
  lastUpdated: new Date('2026-03-06T10:00:00Z'),
};

const mockSetActiveTab = vi.fn();
const mockSetSelectedPeriod = vi.fn();
const mockFetchAnalytics = vi.fn().mockResolvedValue(undefined);
const mockStartPolling = vi.fn().mockReturnValue(vi.fn());

function setupStore(
  overrides: Partial<ReturnType<typeof useAnalyticsStore>> = {},
) {
  vi.mocked(useAnalyticsStore).mockReturnValue({
    data: mockData,
    isLoading: false,
    error: null,
    selectedPeriod: 7,
    activeTab: 'trends',
    setSelectedPeriod: mockSetSelectedPeriod,
    setActiveTab: mockSetActiveTab,
    fetchAnalytics: mockFetchAnalytics,
    startPolling: mockStartPolling,
    ...overrides,
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>,
  );
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page heading', () => {
    setupStore();
    renderPage();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  it('renders 3 tab buttons', () => {
    setupStore();
    renderPage();
    expect(screen.getByRole('tab', { name: 'Risk Trends' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Velocity' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Merchant Stats' })).toBeInTheDocument();
  });

  it('clicking a tab calls setActiveTab', () => {
    setupStore();
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Velocity' }));
    expect(mockSetActiveTab).toHaveBeenCalledWith('velocity');
  });

  it('clicking Merchant Stats tab calls setActiveTab with merchants', () => {
    setupStore();
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Merchant Stats' }));
    expect(mockSetActiveTab).toHaveBeenCalledWith('merchants');
  });

  it('shows loading skeleton when isLoading is true', () => {
    setupStore({ isLoading: true, data: null });
    renderPage();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('shows error banner when error is not null', () => {
    setupStore({ error: 'Failed to fetch analytics', data: null });
    renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch analytics')).toBeInTheDocument();
  });

  it('period selector is visible on trends tab', () => {
    setupStore({ activeTab: 'trends' });
    renderPage();
    expect(screen.getByText('7d')).toBeInTheDocument();
    expect(screen.getByText('30d')).toBeInTheDocument();
  });

  it('period selector is not visible on velocity tab', () => {
    setupStore({ activeTab: 'velocity' });
    renderPage();
    expect(screen.queryByText('7d')).not.toBeInTheDocument();
  });

  it('refresh button calls fetchAnalytics', () => {
    setupStore();
    renderPage();
    fireEvent.click(screen.getByText('Refresh'));
    expect(mockFetchAnalytics).toHaveBeenCalled();
  });

  it('startPolling is called on mount', () => {
    setupStore();
    renderPage();
    expect(mockStartPolling).toHaveBeenCalledWith(30_000);
  });

  it('renders velocity chart when activeTab is velocity', () => {
    setupStore({ activeTab: 'velocity' });
    renderPage();
    expect(screen.getByText('Events per Hour')).toBeInTheDocument();
  });

  it('renders merchant table when activeTab is merchants', () => {
    setupStore({ activeTab: 'merchants' });
    renderPage();
    expect(screen.getByText('Merchant Statistics')).toBeInTheDocument();
  });
});
