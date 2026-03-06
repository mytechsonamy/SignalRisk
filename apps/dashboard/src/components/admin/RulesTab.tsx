import { useState } from 'react';
import { useAdminStore } from '../../store/admin.store';
import RuleWeightSlider from './RuleWeightSlider';
import EditRuleModal from './EditRuleModal';
import AddRuleModal from './AddRuleModal';
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
  const { rules, isLoadingRules, deleteRule, toggleRuleActive } = useAdminStore();
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

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
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">Rules</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-md bg-brand-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-primary/90 transition-colors"
        >
          + Add Rule
        </button>
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
                  <button
                    onClick={() => toggleRuleActive(rule.id, !rule.isActive)}
                    className={`text-xs font-medium transition-colors hover:underline ${rule.isActive ? 'text-green-700' : 'text-text-muted'}`}
                    aria-label={`Toggle ${rule.name} active`}
                    title={rule.isActive ? 'Click to deactivate' : 'Click to activate'}
                  >
                    {rule.isActive ? 'Yes' : 'No'}
                  </button>
                </td>
                <td className="py-3 flex gap-2">
                  <button
                    onClick={() => setEditingRule(rule)}
                    className="rounded-md border border-surface-border px-3 py-1 text-xs font-medium text-text-primary hover:bg-surface-hover transition-colors"
                    aria-label={`Edit rule ${rule.name}`}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete "${rule.name}"?`)) deleteRule(rule.id); }}
                    className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                    aria-label={`Delete rule ${rule.name}`}
                  >
                    Delete
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
      {showAddModal && (
        <AddRuleModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}
