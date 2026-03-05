import { useState, useEffect } from 'react';
import { useCasesStore } from '../store/cases.store';
import CaseFilters from '../components/cases/CaseFilters';
import CasesTable from '../components/cases/CasesTable';
import BulkActionBar from '../components/cases/BulkActionBar';
import CaseDetailPanel from '../components/cases/CaseDetailPanel';

const PAGE_LIMIT = 20;

export default function CasesPage() {
  const { cases, total, page, loading, fetchCases, setPage, selectedIds } = useCasesStore();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  useEffect(() => {
    fetchCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCase = cases.find((c) => c.id === selectedCaseId) ?? null;
  const totalPages = Math.ceil(total / PAGE_LIMIT);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Cases</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Review and manage fraud cases assigned to the queue.
        </p>
      </div>

      <CaseFilters />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <CasesTable onView={(id) => setSelectedCaseId(id)} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-text-secondary">
            Page {page} of {totalPages} &mdash; {total} total cases
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedIds.length > 0 && <BulkActionBar />}

      <CaseDetailPanel
        caseData={selectedCase}
        onClose={() => setSelectedCaseId(null)}
      />
    </div>
  );
}
