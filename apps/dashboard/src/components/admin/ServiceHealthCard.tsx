import type { ServiceHealth } from '../../types/admin.types';

interface Props {
  service: ServiceHealth;
}

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

const STATUS_COLORS: Record<ServiceHealth['status'], string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  down: 'bg-red-500',
};

const STATUS_LABELS: Record<ServiceHealth['status'], string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
};

export default function ServiceHealthCard({ service }: Props) {
  const dotColor = STATUS_COLORS[service.status];

  return (
    <div
      className="rounded-lg border border-surface-border bg-surface-card p-4 space-y-3"
      data-testid={`service-card-${service.name}`}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-text-primary">{service.name}</h3>
        <span className="text-xs text-text-muted">:{service.port}</span>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${dotColor}`}
          aria-hidden="true"
        />
        <span className="text-sm font-medium text-text-primary">
          {STATUS_LABELS[service.status]}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span>
          Latency:{' '}
          <span className="font-medium text-text-primary">
            {service.latencyMs !== null ? `${service.latencyMs}ms` : 'N/A'}
          </span>
        </span>
        <span>Checked {relativeTime(service.lastChecked)}</span>
      </div>
    </div>
  );
}
