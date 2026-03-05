import { useEffect } from 'react';
import { useAnalyticsStore } from '../store/analytics.store';
import RiskScoreHistogram from '../components/analytics/RiskScoreHistogram';
import DecisionDonutChart from '../components/analytics/DecisionDonutChart';
import TrendChart from '../components/analytics/TrendChart';
import VelocityChart from '../components/analytics/VelocityChart';
import MerchantStatsTable from '../components/analytics/MerchantStatsTable';

const TABS = [
  { id: 'trends' as const, label: 'Risk Trends' },
  { id: 'velocity' as const, label: 'Velocity' },
  { id: 'merchants' as const, label: 'Merchant Stats' },
];

export default function AnalyticsPage() {
  const {
    data,
    isLoading,
    error,
    selectedPeriod,
    activeTab,
    setSelectedPeriod,
    setActiveTab,
    fetchAnalytics,
    startPolling,
  } = useAnalyticsStore();

  useEffect(() => {
    const stopPolling = startPolling(30_000);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-content mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Analytics</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Risk trends, velocity, and merchant performance
          </p>
        </div>
        <button
          onClick={() => fetchAnalytics()}
          className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Error banner */}
      {error !== null && (
        <div
          role="alert"
          className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-surface-border">
        <nav className="flex gap-0" aria-label="Analytics tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Period selector — shown on trends tab only */}
      {activeTab === 'trends' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">Period:</span>
          {([7, 30] as const).map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPeriod(p)}
              className={[
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                selectedPeriod === p
                  ? 'bg-brand-primary text-white'
                  : 'border border-surface-border text-text-secondary hover:text-text-primary',
              ].join(' ')}
            >
              {p}d
            </button>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4" aria-label="Loading">
          <div className="h-64 animate-pulse rounded-lg bg-surface-hover" />
          <div className="h-64 animate-pulse rounded-lg bg-surface-hover" />
          <div className="h-64 animate-pulse rounded-lg bg-surface-hover" />
        </div>
      )}

      {/* Content */}
      {!isLoading && data && (
        <>
          {activeTab === 'trends' && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <TrendChart trends={data.trends} />
              <DecisionDonutChart trends={data.trends} />
              <div className="xl:col-span-2">
                <RiskScoreHistogram data={data.riskBuckets} />
              </div>
            </div>
          )}

          {activeTab === 'velocity' && (
            <VelocityChart velocity={data.velocity} />
          )}

          {activeTab === 'merchants' && (
            <MerchantStatsTable merchants={data.merchantStats} />
          )}
        </>
      )}

      {/* Empty state when not loading and no data */}
      {!isLoading && !data && !error && (
        <div className="flex items-center justify-center py-16 text-text-secondary text-sm">
          No analytics data available.
        </div>
      )}
    </div>
  );
}
