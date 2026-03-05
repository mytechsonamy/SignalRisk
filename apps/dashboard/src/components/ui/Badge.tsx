import type { DecisionAction } from '../../store/dashboard.store';

interface Props {
  action: DecisionAction;
  className?: string;
}

const actionConfig: Record<DecisionAction, { label: string; className: string }> = {
  ALLOW: {
    label: 'ALLOW',
    className: 'bg-decision-allow/10 text-decision-allow border border-decision-allow/20',
  },
  REVIEW: {
    label: 'REVIEW',
    className: 'bg-decision-review/10 text-decision-review border border-decision-review/20',
  },
  BLOCK: {
    label: 'BLOCK',
    className: 'bg-decision-block/10 text-decision-block border border-decision-block/20',
  },
};

export default function Badge({ action, className = '' }: Props) {
  const config = actionConfig[action];
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-semibold font-mono ${config.className} ${className}`}
      data-action={action}
    >
      {config.label}
    </span>
  );
}
