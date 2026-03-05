import type { Case } from '../../types/case.types';
import { useCasesStore } from '../../store/cases.store';
import Badge from '../ui/Badge';
import PriorityBadge from './PriorityBadge';
import SlaIndicator from './SlaIndicator';

interface Props {
  onView: (caseId: string) => void;
}

function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...` : id;
}

function getRiskScoreColor(score: number): string {
  if (score >= 80) return 'text-red-600 font-semibold';
  if (score >= 50) return 'text-amber-600 font-semibold';
  return 'text-green-600 font-semibold';
}

const statusLabels: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_REVIEW: 'bg-purple-100 text-purple-700',
  RESOLVED: 'bg-green-100 text-green-700',
  ESCALATED: 'bg-red-100 text-red-700',
};

export default function CasesTable({ onView }: Props) {
  const { cases, selectedIds, toggleSelect, selectAll, clearSelection } = useCasesStore();

  const allSelected = cases.length > 0 && selectedIds.length === cases.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < cases.length;

  const handleSelectAll = () => {
    if (allSelected) {
      clearSelection();
    } else {
      selectAll();
    }
  };

  if (cases.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-text-secondary">
        No cases found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border bg-white">
      <table className="min-w-full divide-y divide-surface-border">
        <thead className="bg-surface-hover">
          <tr>
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                aria-label="Select all cases"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={handleSelectAll}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Case ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Entity ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Action
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Priority
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Risk Score
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
              SLA
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Assignee
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {cases.map((c: Case) => {
            const isSelected = selectedIds.includes(c.id);
            return (
              <tr
                key={c.id}
                className={isSelected ? 'bg-surface-selected-row' : 'hover:bg-surface-hover'}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select case ${c.id}`}
                    checked={isSelected}
                    onChange={() => toggleSelect(c.id)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </td>
                <td className="px-4 py-3 text-sm font-mono text-text-primary" title={c.id}>
                  {truncateId(c.id)}
                </td>
                <td className="px-4 py-3 text-sm font-mono text-text-secondary">
                  {c.entityId}
                </td>
                <td className="px-4 py-3">
                  <Badge action={c.action} />
                </td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={c.priority} />
                </td>
                <td className={`px-4 py-3 text-sm ${getRiskScoreColor(c.riskScore)}`}>
                  {c.riskScore}
                </td>
                <td className="px-4 py-3">
                  <SlaIndicator
                    slaDeadline={c.slaDeadline}
                    createdAt={c.createdAt}
                    status={c.status}
                  />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusLabels[c.status] ?? ''}`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">
                  {c.assignedTo ?? <span className="text-text-muted">Unassigned</span>}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onView(c.id)}
                    className="rounded px-2.5 py-1 text-xs font-medium text-primary border border-primary hover:bg-primary hover:text-white transition-colors"
                  >
                    View
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
