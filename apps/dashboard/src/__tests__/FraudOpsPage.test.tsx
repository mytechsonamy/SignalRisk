import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FraudOpsPage from '../pages/FraudOpsPage';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import { useFraudOpsStore } from '../store/fraud-ops.store';
import { useAuthStore } from '../store/auth.store';
import type { Case } from '../types/case.types';
import type { LabelingStats } from '../types/fraud-ops.types';

vi.mock('../store/fraud-ops.store');
vi.mock('../store/auth.store');

const makeCase = (id: string, riskScore: number, status: Case['status'] = 'OPEN'): Case => ({
  id,
  merchantId: `merchant-${id}`,
  decisionId: `decision-${id}`,
  entityId: `entity-${id}`,
  action: 'REVIEW',
  riskScore,
  riskFactors: [],
  status,
  priority: 'HIGH',
  slaDeadline: new Date(Date.now() + 3 * 3600_000).toISOString(),
  assignedTo: null,
  resolution: null,
  resolutionNotes: null,
  resolvedAt: null,
  createdAt: new Date(Date.now() - 3600_000).toISOString(),
  updatedAt: new Date().toISOString(),
});

const mockStats: LabelingStats = {
  today: {
    labeled: 10,
    fraudConfirmed: 7,
    falsePositives: 2,
    inconclusive: 1,
    accuracy: 0.78,
  },
  pendingReview: 3,
};

const mockFetchReviewCases = vi.fn();
const mockSubmitOutcome = vi.fn();
const mockCloseOutcomeModal = vi.fn();

function setupStore(overrides: Partial<ReturnType<typeof useFraudOpsStore>> = {}) {
  vi.mocked(useFraudOpsStore).mockReturnValue({
    reviewCases: [makeCase('case-001', 90)],
    selectedCaseIds: [],
    stats: mockStats,
    isLoading: false,
    error: null,
    outcomeModalCaseId: null,
    fetchReviewCases: mockFetchReviewCases,
    claimCase: vi.fn(),
    submitOutcome: mockSubmitOutcome,
    toggleCaseSelection: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    bulkLabel: vi.fn(),
    openOutcomeModal: vi.fn(),
    closeOutcomeModal: mockCloseOutcomeModal,
    ...overrides,
  });
}

function setupAuth(role: 'admin' | 'analyst' | 'viewer' = 'analyst') {
  vi.mocked(useAuthStore).mockReturnValue({
    isAuthenticated: true,
    user: { id: '1', email: `${role}@test.com`, role },
    login: vi.fn(),
    logout: vi.fn(),
    initFromStorage: vi.fn(),
  });
}

function renderPage(initialPath = '/fraud-ops') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/unauthorized" element={<div>Unauthorized Page</div>} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/fraud-ops"
          element={
            <ProtectedRoute allowedRoles={['admin', 'analyst']}>
              <FraudOpsPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FraudOpsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Fraud Ops heading', () => {
    setupStore();
    setupAuth('analyst');
    renderPage();
    expect(screen.getByText('Fraud Ops')).toBeInTheDocument();
  });

  it('renders CaseReviewQueue', () => {
    setupStore();
    setupAuth('analyst');
    renderPage();
    expect(screen.getByTestId('case-review-queue')).toBeInTheDocument();
  });

  it('renders LabelingStats when stats are available', () => {
    setupStore();
    setupAuth('analyst');
    renderPage();
    expect(screen.getByTestId('labeling-stats')).toBeInTheDocument();
  });

  it('calls fetchReviewCases on mount', () => {
    setupStore();
    setupAuth('analyst');
    renderPage();
    expect(mockFetchReviewCases).toHaveBeenCalledTimes(1);
  });

  it('redirects to /unauthorized when user role is viewer', () => {
    setupStore();
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      user: { id: '99', email: 'viewer@test.com', role: 'viewer' as never },
      login: vi.fn(),
      logout: vi.fn(),
      initFromStorage: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('Unauthorized Page')).toBeInTheDocument();
  });

  it('shows CaseBatchReview bar when selectedCaseIds is non-empty', () => {
    setupStore({ selectedCaseIds: ['case-001', 'case-002'] });
    setupAuth('analyst');
    renderPage();
    expect(screen.getByTestId('case-batch-review')).toBeInTheDocument();
    expect(screen.getByText('2 cases selected')).toBeInTheDocument();
  });

  it('does not show CaseBatchReview when selectedCaseIds is empty', () => {
    setupStore({ selectedCaseIds: [] });
    setupAuth('analyst');
    renderPage();
    expect(screen.queryByTestId('case-batch-review')).not.toBeInTheDocument();
  });

  it('shows OutcomeModal when outcomeModalCaseId is set', () => {
    setupStore({
      outcomeModalCaseId: 'case-001',
      reviewCases: [makeCase('case-001', 90, 'IN_REVIEW')],
    });
    setupAuth('analyst');
    renderPage();
    expect(screen.getByTestId('outcome-modal')).toBeInTheDocument();
  });

  it('does not show OutcomeModal when outcomeModalCaseId is null', () => {
    setupStore({ outcomeModalCaseId: null });
    setupAuth('analyst');
    renderPage();
    expect(screen.queryByTestId('outcome-modal')).not.toBeInTheDocument();
  });

  it('OutcomeModal close button calls closeOutcomeModal', () => {
    setupStore({
      outcomeModalCaseId: 'case-001',
      reviewCases: [makeCase('case-001', 90, 'IN_REVIEW')],
    });
    setupAuth('analyst');
    renderPage();
    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(mockCloseOutcomeModal).toHaveBeenCalled();
  });

  it('admin can access Fraud Ops page', () => {
    setupStore();
    setupAuth('admin');
    renderPage();
    expect(screen.getByText('Fraud Ops')).toBeInTheDocument();
  });

  // ── Search integration (rendered via CaseReviewQueue) ──

  it('renders a search input for case filtering', () => {
    setupStore();
    setupAuth('analyst');
    renderPage();
    expect(screen.getByTestId('case-search-input')).toBeInTheDocument();
  });

  it('whitespace-only search shows full list and no searching indicator', () => {
    setupStore();
    setupAuth('analyst');
    renderPage();
    const input = screen.getByTestId('case-search-input');
    fireEvent.change(input, { target: { value: '   ' } });
    // Full list should still render
    expect(screen.getByText('merchant-case-001')).toBeInTheDocument();
    // No searching indicator
    expect(screen.queryByTestId('searching-indicator')).not.toBeInTheDocument();
  });
});
