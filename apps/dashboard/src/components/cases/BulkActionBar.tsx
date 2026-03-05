import { useCasesStore } from '../../store/cases.store';

export default function BulkActionBar() {
  const { selectedIds, bulkResolve, clearSelection } = useCasesStore();

  if (selectedIds.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between border-t border-surface-border bg-white px-6 py-3 shadow-lg">
      <span className="text-sm font-medium text-text-primary">
        {selectedIds.length} {selectedIds.length === 1 ? 'case' : 'cases'} selected
      </span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => bulkResolve('FRAUD')}
          className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
        >
          Resolve as Fraud
        </button>
        <button
          onClick={() => bulkResolve('LEGITIMATE')}
          className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
        >
          Resolve as Legitimate
        </button>
        <button
          onClick={clearSelection}
          className="rounded-md border border-surface-border px-4 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
