import { useEffect } from 'react';
import { useFraudOpsStore } from '../store/fraud-ops.store';
import CaseReviewQueue from '../components/fraud-ops/CaseReviewQueue';
import LabelingStatsBar from '../components/fraud-ops/LabelingStats';
import OutcomeModal from '../components/fraud-ops/OutcomeModal';
import CaseBatchReview from '../components/fraud-ops/CaseBatchReview';

export default function FraudOpsPage() {
  const {
    stats,
    reviewCases,
    selectedCaseIds,
    outcomeModalCaseId,
    fetchReviewCases,
    submitOutcome,
    closeOutcomeModal,
  } = useFraudOpsStore();

  useEffect(() => {
    fetchReviewCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeCase = outcomeModalCaseId
    ? reviewCases.find((c) => c.id === outcomeModalCaseId) ?? null
    : null;

  return (
    <div className="p-6 pb-20">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Fraud Ops</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Review queued cases and label outcomes to improve rule accuracy.
          </p>
        </div>
        <LabelingStatsBar stats={stats} />
      </div>

      {/* Main content — queue takes 70% */}
      <div className="w-full lg:w-[70%]">
        <CaseReviewQueue />
      </div>

      {/* Outcome modal */}
      {activeCase && (
        <OutcomeModal
          caseData={activeCase}
          onSubmit={(outcome) => submitOutcome(activeCase.id, outcome)}
          onClose={closeOutcomeModal}
        />
      )}

      {/* Batch review bar */}
      {selectedCaseIds.length > 0 && <CaseBatchReview />}
    </div>
  );
}
