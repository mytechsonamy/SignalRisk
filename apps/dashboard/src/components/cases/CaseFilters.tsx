import { useCallback, useRef } from 'react';
import { useCasesStore } from '../../store/cases.store';
import type { CaseStatus, CasePriority } from '../../types/case.types';

export default function CaseFilters() {
  const { filters, setFilter } = useCasesStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setFilter('search', value || undefined);
      }, 300);
    },
    [setFilter],
  );

  const handleStatus = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilter('status', e.target.value || undefined);
  };

  const handlePriority = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilter('priority', e.target.value || undefined);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <select
        value={filters.status ?? ''}
        onChange={handleStatus}
        aria-label="Filter by status"
        className="rounded-md border border-surface-border bg-white px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">All Statuses</option>
        {(['OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED'] as CaseStatus[]).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        value={filters.priority ?? ''}
        onChange={handlePriority}
        aria-label="Filter by priority"
        className="rounded-md border border-surface-border bg-white px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">All Priorities</option>
        {(['HIGH', 'MEDIUM', 'LOW'] as CasePriority[]).map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Search by entity ID..."
        defaultValue={filters.search ?? ''}
        onChange={handleSearch}
        aria-label="Search cases"
        className="rounded-md border border-surface-border bg-white px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary w-64"
      />
    </div>
  );
}
