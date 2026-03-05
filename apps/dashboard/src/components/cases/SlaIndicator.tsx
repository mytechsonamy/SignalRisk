import type { CaseStatus } from '../../types/case.types';

interface Props {
  slaDeadline: string;
  createdAt: string;
  status: CaseStatus;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return 'Overdue';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function SlaIndicator({ slaDeadline, createdAt, status }: Props) {
  if (status === 'RESOLVED' || status === 'ESCALATED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
        <span className="h-2 w-2 rounded-full bg-text-muted" />
        Resolved
      </span>
    );
  }

  const now = Date.now();
  const deadline = new Date(slaDeadline).getTime();
  const created = new Date(createdAt).getTime();
  const timeRemaining = deadline - now;
  const totalTime = deadline - created;

  const pctRemaining = totalTime > 0 ? (timeRemaining / totalTime) * 100 : 0;
  const isOverdue = timeRemaining <= 0;

  let colorClass: string;
  let dotClass: string;
  if (isOverdue || pctRemaining < 10) {
    colorClass = 'text-red-600';
    dotClass = 'bg-red-500';
  } else if (pctRemaining < 50) {
    colorClass = 'text-amber-600';
    dotClass = 'bg-amber-500';
  } else {
    colorClass = 'text-green-600';
    dotClass = 'bg-green-500';
  }

  const label = isOverdue ? 'Overdue' : formatDuration(timeRemaining);

  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${colorClass}`}>
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}
