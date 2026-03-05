import { useRef, useState } from 'react';
import { useAdminStore } from '../../store/admin.store';

interface Props {
  ruleId: string;
  initialWeight: number;
}

function weightColor(weight: number): string {
  if (weight > 0.7) return 'text-green-600';
  if (weight >= 0.4) return 'text-amber-600';
  return 'text-red-600';
}

export default function RuleWeightSlider({ ruleId, initialWeight }: Props) {
  const { updateRuleWeight } = useAdminStore();
  const [value, setValue] = useState(initialWeight);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    setValue(newValue);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      updateRuleWeight(ruleId, newValue);
    }, 500);
  };

  return (
    <div className="flex items-center gap-2" data-testid={`weight-slider-${ruleId}`}>
      <input
        type="range"
        min="0.1"
        max="1.0"
        step="0.05"
        value={value}
        onChange={handleChange}
        aria-label={`Rule weight: ${value}`}
        className="w-24 cursor-pointer accent-brand-primary"
      />
      <span className={`text-xs font-medium tabular-nums ${weightColor(value)}`}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}
