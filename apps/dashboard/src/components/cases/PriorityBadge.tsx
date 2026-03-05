import type { CasePriority } from '../../types/case.types';

interface Props {
  priority: CasePriority;
  className?: string;
}

const priorityConfig: Record<CasePriority, { label: string; className: string }> = {
  HIGH: {
    label: 'HIGH',
    className: 'bg-red-100 text-red-700 border border-red-200',
  },
  MEDIUM: {
    label: 'MEDIUM',
    className: 'bg-amber-100 text-amber-700 border border-amber-200',
  },
  LOW: {
    label: 'LOW',
    className: 'bg-gray-100 text-gray-600 border border-gray-200',
  },
};

export default function PriorityBadge({ priority, className = '' }: Props) {
  const config = priorityConfig[priority];
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-semibold font-mono ${config.className} ${className}`}
      data-priority={priority}
    >
      {config.label}
    </span>
  );
}
