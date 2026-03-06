import { useFraudOpsStore } from '../../store/fraud-ops.store';

export default function CaseBatchReview() {
  const { selectedCaseIds, bulkLabel, clearSelection } = useFraudOpsStore();

  if (selectedCaseIds.length === 0) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-surface-border bg-surface-card shadow-lg px-6 py-3"
      data-testid="case-batch-review"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-text-primary">
            {selectedCaseIds.length} case{selectedCaseIds.length > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={clearSelection}
            className="text-xs text-text-secondary hover:text-text-primary underline transition-colors"
          >
            Clear
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => bulkLabel('fraud_confirmed')}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 active:bg-red-800 transition-colors"
            data-testid="bulk-mark-fraud"
          >
            Mark Fraud
          </button>
          <button
            onClick={() => bulkLabel('false_positive')}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 active:bg-green-800 transition-colors"
            data-testid="bulk-mark-fp"
          >
            Mark False Positive
          </button>
        </div>
      </div>
    </div>
  );
}
