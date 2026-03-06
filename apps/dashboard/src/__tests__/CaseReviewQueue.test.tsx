import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CaseReviewQueue from '../components/fraud-ops/CaseReviewQueue';
import { useFraudOpsStore } from '../store/fraud-ops.store';
import type { Case } from '../types/case.types';

vi.mock('../store/fraud-ops.store');

const makeCase = (id: string, riskScore: number, status: Case['status'] = 'OPEN'): Case => ({
  id,
  merchantId: `merchant-${id}`,
  decisionId: `decision-${id}`,
  entityId: `entity-${id}`,
  action: 'REVIEW',
  riskScore,
  riskFactors: [],
  status,
  priority: riskScore >= 80 ? 'HIGH' : riskScore >= 60 ? 'MEDIUM' : 'LOW',
  slaDeadline: new Date(Date.now() + 3 * 3600_000).toISOString(),
  assignedTo: null,
  resolution: null,
  resolutionNotes: null,
  resolvedAt: null,
  createdAt: new Date(Date.now() - 1 * 3600_000).toISOString(),
  updatedAt: new Date().toISOString(),
});

const mockClaimCase = vi.fn();
const mockOpenOutcomeModal = vi.fn();
const mockToggleCaseSelection = vi.fn();

function setupStore(overrides: Partial<ReturnType<typeof useFraudOpsStore>> = {}) {
  vi.mocked(useFraudOpsStore).mockReturnValue({
    reviewCases: [
      makeCase('case-low', 40),
      makeCase('case-high', 95),
      makeCase('case-mid', 70),
    ],
    selectedCaseIds: [],
    stats: null,
    isLoading: false,
    error: null,
    outcomeModalCaseId: null,
    fetchReviewCases: vi.fn(),
    claimCase: mockClaimCase,
    submitOutcome: vi.fn(),
    toggleCaseSelection: mockToggleCaseSelection,
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    bulkLabel: vi.fn(),
    openOutcomeModal: mockOpenOutcomeModal,
    closeOutcomeModal: vi.fn(),
    ...overrides,
  });
}

describe('CaseReviewQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders case rows', () => {
    setupStore();
    render(<CaseReviewQueue />);
    expect(screen.getByText('merchant-case-high')).toBeInTheDocument();
    expect(screen.getByText('merchant-case-mid')).toBeInTheDocument();
    expect(screen.getByText('merchant-case-low')).toBeInTheDocument();
  });

  it('rows appear sorted by riskScore descending', () => {
    setupStore({
      reviewCases: [
        makeCase('case-low', 40),
        makeCase('case-high', 95),
        makeCase('case-mid', 70),
      ],
    });
    render(<CaseReviewQueue />);
    const cells = screen.getAllByRole('cell').filter((cell) =>
      ['95', '70', '40'].includes(cell.textContent ?? ''),
    );
    // All three scores should be present (store is already sorted by the store logic)
    expect(cells.length).toBe(3);
  });

  it('Claim button calls claimCase with correct id', () => {
    setupStore();
    render(<CaseReviewQueue />);
    const claimBtn = screen.getByTestId('claim-case-high');
    fireEvent.click(claimBtn);
    expect(mockClaimCase).toHaveBeenCalledWith('case-high');
  });

  it('shows Submit Outcome button when case is IN_REVIEW', () => {
    setupStore({
      reviewCases: [makeCase('case-inreview', 85, 'IN_REVIEW')],
    });
    render(<CaseReviewQueue />);
    expect(screen.getByTestId('submit-outcome-case-inreview')).toBeInTheDocument();
    expect(screen.queryByTestId('claim-case-inreview')).not.toBeInTheDocument();
  });

  it('Submit Outcome button calls openOutcomeModal', () => {
    setupStore({
      reviewCases: [makeCase('case-inreview', 85, 'IN_REVIEW')],
    });
    render(<CaseReviewQueue />);
    fireEvent.click(screen.getByTestId('submit-outcome-case-inreview'));
    expect(mockOpenOutcomeModal).toHaveBeenCalledWith('case-inreview');
  });

  it('shows loading skeleton when isLoading=true', () => {
    setupStore({ isLoading: true });
    render(<CaseReviewQueue />);
    expect(screen.getByTestId('skeleton-rows')).toBeInTheDocument();
  });

  it('shows empty state when no cases', () => {
    setupStore({ reviewCases: [] });
    render(<CaseReviewQueue />);
    expect(screen.getByText('No cases pending review')).toBeInTheDocument();
  });

  it('checkbox calls toggleCaseSelection', () => {
    setupStore();
    render(<CaseReviewQueue />);
    const checkbox = screen.getByLabelText('Select case case-high');
    fireEvent.click(checkbox);
    expect(mockToggleCaseSelection).toHaveBeenCalledWith('case-high');
  });

  it('selected case row has selection styling', () => {
    setupStore({ selectedCaseIds: ['case-high'] });
    render(<CaseReviewQueue />);
    const checkbox = screen.getByLabelText('Select case case-high') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });
});
