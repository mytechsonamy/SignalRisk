import { useEffect } from 'react';
import KpiGrid from '../components/overview/KpiGrid';
import TrendChart from '../components/overview/TrendChart';
import EventStream from '../components/overview/EventStream';
import { useDashboardStore } from '../store/dashboard.store';

export default function OverviewPage() {
  const { isStale, lastUpdated } = useDashboardStore();

  useEffect(() => {
    const store = useDashboardStore.getState();
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        await store.fetchOverviewData();
        useDashboardStore.getState().setStale(false, Date.now());
      } catch {
        useDashboardStore.getState().setStale(true);
      } finally {
        timer = setTimeout(poll, 30_000);
      }
    };

    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - useDashboardStore.getState().lastUpdated > 30_000
      ) {
        clearTimeout(timer);
        poll();
      }
    };

    poll(); // initial fetch on mount
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-content mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Overview</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Real-time fraud decision metrics and event stream
        </p>
      </div>

      {isStale && (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-600 text-xs font-medium">
          Offline — last updated {lastUpdated ? `${Math.round((Date.now() - lastUpdated) / 60000)}m ago` : 'unknown'}
        </div>
      )}

      <KpiGrid />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <TrendChart />
        <div className="min-h-[320px]">
          <EventStream />
        </div>
      </div>
    </div>
  );
}
