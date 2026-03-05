import { useState } from 'react';
import { useAdminStore } from '../../store/admin.store';
import RuleWeightSlider from './RuleWeightSlider';
import EditRuleModal from './EditRuleModal';
import type { Rule } from '../../types/admin.types';

const OUTCOME_STYLES: Record<Rule['outcome'], string> = {
  ALLOW: 'bg-green-50 border-green-200 text-green-700',
  REVIEW: 'bg-amber-50 border-amber-200 text-amber-700',
  BLOCK: 'bg-red-50 border-red-200 text-red-700',
};

function truncate(str: string, maxLen = 60): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
}

export default function RulesTab() {
  const { rules, isLoadingRules } = useAdminStore();
  const [editingRule, setEditingRule] = useState<Rule | null>(null);

  if (isLoadingRules) {
    return (
      <div aria-label="Loading" className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-surface-hover" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-text-primary">Rules</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="pb-2 text-left font-medium text-text-secondary">Rule Name</th>
              <th className="pb-2 text-left font-medium text-text-secondary">Expression</th>
              <th className="pb-2 text-left font-medium text-text-secondary">Outcome</th>
              <th className="pb-2 text-left font-medium text-text-secondary">Weight</th>
              <th className="pb-2 text-left font-medium text-text-secondary">Active</th>
              <th className="pb-2 text-left font-medium text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-b border-surface-border/50">
                <td className="py-3 font-medium text-text-primary">{rule.name}</td>
                <td className="py-3 max-w-xs">
                  <span
                    className="font-mono text-xs text-text-secondary"
                    title={rule.expression}
                  >
                    {truncate(rule.expression)}
                  </span>
                </td>
                <td className="py-3">
                  <span
                    className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${OUTCOME_STYLES[rule.outcome]}`}
                  >
                    {rule.outcome}
                  </span>
                </td>
                <td className="py-3">
                  <RuleWeightSlider ruleId={rule.id} initialWeight={rule.weight} />
                </td>
                <td className="py-3">
                  {rule.isActive ? (
                    <span className="text-xs font-medium text-green-700">Yes</span>
                  ) : (
                    <span className="text-xs font-medium text-text-muted">No</span>
                  )}
                </td>
                <td className="py-3">
                  <button
                    onClick={() => setEditingRule(rule)}
                    className="rounded-md border border-surface-border px-3 py-1 text-xs font-medium text-text-primary hover:bg-surface-hover transition-colors"
                    aria-label={`Edit rule ${rule.name}`}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-secondary">
                  No rules found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingRule && (
        <EditRuleModal rule={editingRule} onClose={() => setEditingRule(null)} />
      )}
    </div>
  );
}
