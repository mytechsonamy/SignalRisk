import { useEffect } from 'react';
import { useAdminStore } from '../../store/admin.store';
import ServiceHealthCard from './ServiceHealthCard';
import type { ServiceHealth } from '../../types/admin.types';

function overallStatus(services: ServiceHealth[]): 'operational' | 'degraded' | 'outage' {
  if (services.length === 0) return 'operational';
  if (services.some((s) => s.status === 'down')) return 'outage';
  if (services.some((s) => s.status === 'degraded')) return 'degraded';
  return 'operational';
}

const STATUS_BANNER: Record<
  'operational' | 'degraded' | 'outage',
  { label: string; className: string }
> = {
  operational: {
    label: 'All Systems Operational',
    className: 'bg-green-50 border-green-200 text-green-800',
  },
  degraded: {
    label: 'Degraded',
    className: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  outage: {
    label: 'Outage',
    className: 'bg-red-50 border-red-200 text-red-800',
  },
};

function formatLastChecked(services: ServiceHealth[]): string {
  if (services.length === 0) return 'Never';
  const latest = services.reduce((a, b) =>
    new Date(a.lastChecked) > new Date(b.lastChecked) ? a : b,
  );
  return new Date(latest.lastChecked).toLocaleTimeString();
}

export default function SystemHealthTab() {
  const { services, isLoadingServices, fetchServiceHealth, startHealthPolling } = useAdminStore();

  useEffect(() => {
    const stop = startHealthPolling(30_000);
    return stop;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = overallStatus(services);
  const banner = STATUS_BANNER[status];

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border px-4 py-3 font-medium ${banner.className}`}>
        {banner.label}
      </div>

      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span>Last checked: {formatLastChecked(services)}</span>
        <button
          onClick={() => fetchServiceHealth()}
          disabled={isLoadingServices}
          className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50 transition-colors"
        >
          {isLoadingServices ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {isLoadingServices && services.length === 0 ? (
        <div aria-label="Loading" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-surface-hover" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <ServiceHealthCard key={service.name} service={service} />
          ))}
          {services.length === 0 && (
            <p className="col-span-3 py-8 text-center text-text-secondary">No services found</p>
          )}
        </div>
      )}
    </div>
  );
}
