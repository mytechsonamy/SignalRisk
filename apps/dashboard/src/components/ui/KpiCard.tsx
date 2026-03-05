interface TrendIndicator {
  value: number;
  direction: 'up' | 'down';
  isPositive: boolean;
}

interface Props {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: TrendIndicator;
  className?: string;
}

export default function KpiCard({ icon, label, value, trend, className = '' }: Props) {
  return (
    <div
      className={`rounded-lg bg-surface-card p-5 shadow-md flex flex-col gap-3 ${className}`}
      role="region"
      aria-label={label}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">{label}</span>
        <span className="text-text-secondary">{icon}</span>
      </div>

      <div className="flex items-end justify-between">
        <span className="text-[2rem] font-bold text-text-primary leading-tight tabular-nums">
          {value}
        </span>

        {trend && (
          <div
            className={`flex items-center gap-1 text-sm font-medium ${
              trend.isPositive ? 'text-decision-allow' : 'text-decision-block'
            }`}
            data-testid="trend-indicator"
            aria-label={`Trend: ${trend.direction} ${Math.abs(trend.value)}%`}
          >
            {trend.direction === 'up' ? (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
