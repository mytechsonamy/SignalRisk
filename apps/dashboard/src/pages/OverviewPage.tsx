import KpiGrid from '../components/overview/KpiGrid';
import TrendChart from '../components/overview/TrendChart';
import EventStream from '../components/overview/EventStream';

export default function OverviewPage() {
  return (
    <div className="p-6 space-y-6 max-w-content mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Overview</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Real-time fraud decision metrics and event stream
        </p>
      </div>

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
