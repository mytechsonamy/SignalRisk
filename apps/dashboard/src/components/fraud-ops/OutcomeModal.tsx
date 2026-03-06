import type { Case } from '../../types/case.types';
import type { CaseOutcome } from '../../types/fraud-ops.types';

interface OutcomeModalProps {
  caseData: Case;
  onSubmit: (outcome: CaseOutcome) => void;
  onClose: () => void;
}

export default function OutcomeModal({ caseData, onSubmit, onClose }: OutcomeModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Submit outcome"
      data-testid="outcome-modal"
    >
      <div className="relative w-full max-w-md rounded-xl bg-surface-card shadow-2xl border border-surface-border p-6 mx-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Close modal"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-lg font-semibold text-text-primary mb-4">Submit Case Outcome</h2>

        <div className="rounded-lg bg-surface-hover p-4 mb-5 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Merchant</span>
            <span className="font-medium text-text-primary">{caseData.merchantId}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Risk Score</span>
            <span className="font-bold text-red-600">{caseData.riskScore}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Priority</span>
            <span className="font-medium text-text-primary">{caseData.priority}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Created</span>
            <span className="font-medium text-text-primary">
              {new Date(caseData.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <p className="text-sm text-text-secondary mb-5 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Are you sure? This will update rule weights.
        </p>

        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => onSubmit('fraud_confirmed')}
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 active:bg-red-800 transition-colors"
            data-testid="btn-fraud-confirmed"
          >
            Fraud Confirmed
          </button>
          <button
            onClick={() => onSubmit('false_positive')}
            className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 active:bg-green-800 transition-colors"
            data-testid="btn-false-positive"
          >
            False Positive
          </button>
          <button
            onClick={() => onSubmit('inconclusive')}
            className="rounded-lg bg-surface-border px-4 py-2.5 text-sm font-semibold text-text-primary hover:bg-surface-hover active:bg-surface-hover transition-colors border border-surface-border"
            data-testid="btn-inconclusive"
          >
            Inconclusive
          </button>
        </div>
      </div>
    </div>
  );
}
