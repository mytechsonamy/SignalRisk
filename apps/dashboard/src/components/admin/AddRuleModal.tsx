import { useState } from 'react';
import { useAdminStore } from '../../store/admin.store';
import type { Rule } from '../../types/admin.types';
import RuleBuilder, { conditionsToDsl, type Condition } from './RuleBuilder';

interface Props {
  onClose: () => void;
}

const OUTCOMES: Rule['outcome'][] = ['ALLOW', 'REVIEW', 'BLOCK'];

const OUTCOME_COLORS: Record<Rule['outcome'], string> = {
  ALLOW: 'text-green-700 bg-green-50 border-green-200',
  REVIEW: 'text-amber-700 bg-amber-50 border-amber-200',
  BLOCK: 'text-red-700 bg-red-50 border-red-200',
};

export default function AddRuleModal({ onClose }: Props) {
  const { createRule } = useAdminStore();
  const [name, setName] = useState('');
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [outcome, setOutcome] = useState<Rule['outcome']>('REVIEW');
  const [weight, setWeight] = useState(0.5);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const expression = conditionsToDsl(conditions);

  const handleSave = async () => {
    if (!name.trim()) { setError('Rule name is required'); return; }
    if (!expression.trim()) { setError('At least one condition is required'); return; }

    // Validate all conditions have values
    const empty = conditions.find((c) => c.value === '' || c.value === undefined);
    if (empty) { setError('All conditions must have a value'); return; }

    setError(null);
    setIsSubmitting(true);
    try {
      await createRule({ name: name.trim(), expression, outcome, weight, isActive });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Add Rule"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-surface-card border border-surface-border p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Add New Rule</h2>

        {error && (
          <div role="alert" className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="rule-name" className="block text-sm font-medium text-text-primary mb-1">
              Rule Name
            </label>
            <input
              id="rule-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. High Risk Country Block"
              className="w-full rounded-md border border-surface-border bg-surface-input px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Conditions
            </label>
            <RuleBuilder conditions={conditions} onChange={setConditions} />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-text-primary mb-1">Outcome</label>
              <div className="flex gap-2">
                {OUTCOMES.map(o => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOutcome(o)}
                    className={`flex-1 rounded border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      outcome === o ? OUTCOME_COLORS[o] : 'border-surface-border text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-28">
              <label htmlFor="rule-weight" className="block text-sm font-medium text-text-primary mb-1">
                Weight <span className="text-text-secondary">({weight.toFixed(2)})</span>
              </label>
              <input
                id="rule-weight"
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={weight}
                onChange={e => setWeight(parseFloat(e.target.value))}
                className="w-full accent-brand-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="rule-active"
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-surface-border accent-brand-primary"
            />
            <label htmlFor="rule-active" className="text-sm text-text-primary">
              Active immediately
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Creating…' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
