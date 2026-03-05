import KpiCard from '../ui/KpiCard';
import { useDashboardStore } from '../../store/dashboard.store';

function ZapIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function ShieldXIcon() {
  return (
    <svg className="h-5 w-5 text-decision-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016zM10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
      />
    </svg>
  );
}

function AlertCircleIcon() {
  return (
    <svg className="h-5 w-5 text-decision-review" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

export default function KpiGrid() {
  const { kpi } = useDashboardStore();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" role="region" aria-label="KPI metrics">
      <KpiCard
        icon={<ZapIcon />}
        label="Decisions / hr"
        value={kpi.decisionsPerHour.toLocaleString()}
        trend={{ value: 12, direction: 'up', isPositive: true }}
      />
      <KpiCard
        icon={<ShieldXIcon />}
        label="Block Rate %"
        value={`${kpi.blockRatePct.toFixed(1)}%`}
        trend={{ value: 0.3, direction: 'down', isPositive: true }}
      />
      <KpiCard
        icon={<AlertCircleIcon />}
        label="Review Rate %"
        value={`${kpi.reviewRatePct.toFixed(1)}%`}
        trend={{ value: 1.2, direction: 'up', isPositive: false }}
      />
      <KpiCard
        icon={<ClockIcon />}
        label="Avg Latency ms"
        value={kpi.avgLatencyMs}
        trend={{ value: 3, direction: 'down', isPositive: true }}
      />
    </div>
  );
}
