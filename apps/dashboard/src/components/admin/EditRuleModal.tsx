import { useState } from 'react';
import { useAdminStore } from '../../store/admin.store';
import type { Rule } from '../../types/admin.types';
import RuleBuilder, { conditionsToDsl, parseDslToConditions, type Condition } from './RuleBuilder';

interface Props {
  rule: Rule;
  onClose: () => void;
}

const OUTCOME_COLORS: Record<Rule['outcome'], string> = {
  ALLOW: 'text-green-700 bg-green-50 border-green-200',
  REVIEW: 'text-amber-700 bg-amber-50 border-amber-200',
  BLOCK: 'text-red-700 bg-red-50 border-red-200',
};

export default function EditRuleModal({ rule, onClose }: Props) {
  const { updateRuleExpression } = useAdminStore();
  const [conditions, setConditions] = useState<Condition[]>(
    () => parseDslToConditions(rule.expression) ?? [],
  );
  const [useFreeText, setUseFreeText] = useState(
    () => parseDslToConditions(rule.expression) === null && rule.expression.trim().length > 0,
  );
  const [freeText, setFreeText] = useState(rule.expression);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const expression = useFreeText ? freeText : conditionsToDsl(conditions);

  const handleSave = async () => {
    if (!expression.trim()) { setError('Expression is required'); return; }

    if (!useFreeText) {
      const empty = conditions.find((c) => c.value === '' || c.value === undefined);
      if (empty) { setError('All conditions must have a value'); return; }
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await updateRuleExpression(rule.id, expression);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update rule';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Edit Rule"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-surface-card border border-surface-border p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text-primary mb-1">Edit Rule</h2>
        <p className="text-sm text-text-secondary mb-4">{rule.name}</p>

        <div className="mb-4 flex items-center gap-3">
          <span className="text-xs font-medium text-text-secondary">Outcome:</span>
          <span
            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${OUTCOME_COLORS[rule.outcome]}`}
          >
            {rule.outcome}
          </span>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Mode toggle */}
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUseFreeText(false)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              !useFreeText ? 'bg-brand-primary text-white' : 'border border-surface-border text-text-secondary hover:bg-surface-hover'
            }`}
          >
            Visual Builder
          </button>
          <button
            type="button"
            onClick={() => {
              setFreeText(conditionsToDsl(conditions) || rule.expression);
              setUseFreeText(true);
            }}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              useFreeText ? 'bg-brand-primary text-white' : 'border border-surface-border text-text-secondary hover:bg-surface-hover'
            }`}
          >
            DSL Editor
          </button>
        </div>

        {useFreeText ? (
          <div className="mb-4">
            <label htmlFor="rule-expression" className="block text-sm font-medium text-text-primary mb-1">
              DSL Expression
            </label>
            <textarea
              id="rule-expression"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-surface-border bg-surface-input px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary resize-vertical"
            />
          </div>
        ) : (
          <div className="mb-4">
            <RuleBuilder conditions={conditions} onChange={setConditions} />
          </div>
        )}

        <div className="flex justify-end gap-3">
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
            {isSubmitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
