import { create } from 'zustand';
import type { Case } from '../types/case.types';
import type { CaseOutcome, LabelingStats } from '../types/fraud-ops.types';
import {
  fetchReviewCases,
  claimCase as apiClaimCase,
  submitOutcome as apiSubmitOutcome,
  fetchLabelingStats,
  bulkLabelCases as apiBulkLabelCases,
} from '../api/fraud-ops.api';

interface FraudOpsStore {
  reviewCases: Case[];
  selectedCaseIds: string[];
  stats: LabelingStats | null;
  isLoading: boolean;
  error: string | null;
  outcomeModalCaseId: string | null;

  fetchReviewCases: () => Promise<void>;
  claimCase: (caseId: string) => Promise<void>;
  submitOutcome: (caseId: string, outcome: CaseOutcome) => Promise<void>;
  toggleCaseSelection: (caseId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  bulkLabel: (outcome: CaseOutcome) => Promise<void>;
  openOutcomeModal: (caseId: string) => void;
  closeOutcomeModal: () => void;
}

export const useFraudOpsStore = create<FraudOpsStore>((set, get) => ({
  reviewCases: [],
  selectedCaseIds: [],
  stats: null,
  isLoading: false,
  error: null,
  outcomeModalCaseId: null,

  fetchReviewCases: async () => {
    set({ isLoading: true, error: null });
    try {
      const [cases, stats] = await Promise.all([fetchReviewCases(), fetchLabelingStats()]);
      set({
        reviewCases: [...cases].sort((a, b) => b.riskScore - a.riskScore),
        stats: {
          ...stats,
          pendingReview: cases.length,
        },
      });
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  claimCase: async (caseId: string) => {
    try {
      const updated = await apiClaimCase(caseId);
      set((state) => ({
        reviewCases: state.reviewCases.map((c) => (c.id === caseId ? { ...c, ...updated } : c)),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  submitOutcome: async (caseId: string, outcome: CaseOutcome) => {
    try {
      await apiSubmitOutcome(caseId, outcome);
      set((state) => {
        const fraudConfirmed =
          state.stats?.today.fraudConfirmed ?? 0 + (outcome === 'fraud_confirmed' ? 1 : 0);
        const falsePositives =
          state.stats?.today.falsePositives ?? 0 + (outcome === 'false_positive' ? 1 : 0);
        const inconclusive =
          state.stats?.today.inconclusive ?? 0 + (outcome === 'inconclusive' ? 1 : 0);
        const labeled = fraudConfirmed + falsePositives + inconclusive;
        const total = fraudConfirmed + falsePositives;
        const accuracy = total > 0 ? fraudConfirmed / total : 0;

        return {
          reviewCases: state.reviewCases.filter((c) => c.id !== caseId),
          outcomeModalCaseId: null,
          stats: state.stats
            ? {
                today: {
                  labeled,
                  fraudConfirmed,
                  falsePositives,
                  inconclusive,
                  accuracy,
                },
                pendingReview: Math.max(0, (state.stats.pendingReview ?? 0) - 1),
              }
            : null,
        };
      });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  toggleCaseSelection: (caseId: string) => {
    set((state) => {
      const isSelected = state.selectedCaseIds.includes(caseId);
      return {
        selectedCaseIds: isSelected
          ? state.selectedCaseIds.filter((id) => id !== caseId)
          : [...state.selectedCaseIds, caseId],
      };
    });
  },

  selectAll: () => {
    set((state) => ({ selectedCaseIds: state.reviewCases.map((c) => c.id) }));
  },

  clearSelection: () => {
    set({ selectedCaseIds: [] });
  },

  bulkLabel: async (outcome: CaseOutcome) => {
    const { selectedCaseIds } = get();
    if (selectedCaseIds.length === 0) return;
    try {
      await apiBulkLabelCases(selectedCaseIds, outcome);
      set((state) => ({
        reviewCases: state.reviewCases.filter((c) => !state.selectedCaseIds.includes(c.id)),
        selectedCaseIds: [],
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  openOutcomeModal: (caseId: string) => {
    set({ outcomeModalCaseId: caseId });
  },

  closeOutcomeModal: () => {
    set({ outcomeModalCaseId: null });
  },
}));
