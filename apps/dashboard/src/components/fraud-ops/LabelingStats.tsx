import type { LabelingStats } from '../../types/fraud-ops.types';

interface LabelingStatsProps {
  stats: LabelingStats | null;
}

function accuracyColor(accuracy: number): string {
  if (accuracy >= 0.8) return 'text-green-600';
  if (accuracy >= 0.6) return 'text-amber-500';
  return 'text-red-500';
}

export default function LabelingStatsBar({ stats }: LabelingStatsProps) {
  if (!stats) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-8 w-32 animate-pulse rounded bg-surface-hover" />
        <div className="h-8 w-24 animate-pulse rounded bg-surface-hover" />
        <div className="h-8 w-24 animate-pulse rounded bg-surface-hover" />
        <div className="h-8 w-28 animate-pulse rounded bg-surface-hover" />
      </div>
    );
  }

  const { today, pendingReview } = stats;
  const accuracyPct = Math.round(today.accuracy * 100);
  const colorClass = accuracyColor(today.accuracy);

  return (
    <div className="flex items-center gap-3 flex-wrap" data-testid="labeling-stats">
      <span className="inline-flex items-center rounded-full bg-surface-card border border-surface-border px-3 py-1.5 text-sm font-medium text-text-primary">
        Today:{' '}
        <span className="ml-1 font-bold" data-testid="stat-labeled">
          {today.labeled}
        </span>{' '}
        labeled
      </span>

      <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700">
        Fraud:{' '}
        <span className="ml-1 font-bold" data-testid="stat-fraud">
          {today.fraudConfirmed}
        </span>
      </span>

      <span className="inline-flex items-center rounded-full bg-green-50 border border-green-200 px-3 py-1.5 text-sm font-medium text-green-700">
        FP:{' '}
        <span className="ml-1 font-bold" data-testid="stat-fp">
          {today.falsePositives}
        </span>
      </span>

      <span
        className={`inline-flex items-center rounded-full bg-surface-card border border-surface-border px-3 py-1.5 text-sm font-medium ${colorClass}`}
        data-testid="stat-accuracy"
      >
        Accuracy:{' '}
        <span className="ml-1 font-bold">{accuracyPct}%</span>
      </span>

      {pendingReview > 0 && (
        <span
          className="inline-flex items-center rounded-full bg-amber-100 border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700"
          data-testid="stat-pending"
        >
          Pending:{' '}
          <span className="ml-1 font-bold">{pendingReview}</span>
        </span>
      )}
    </div>
  );
}
