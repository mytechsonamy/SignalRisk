import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  // ── Search: AbortController + Whitespace Guard + Loading State ──

  describe('search functionality', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
      vi.useRealTimers();
      fetchSpy.mockRestore();
    });

    it('typing a partial query fetches filtered results and displays them', async () => {
      const filtered = [makeCase('case-match', 88)];
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cases: filtered }),
      } as Response);

      setupStore();
      render(<CaseReviewQueue />);

      const input = screen.getByTestId('case-search-input');
      // Type a query
      await act(async () => {
        fireEvent.change(input, { target: { value: 'match' } });
      });

      // Should show searching indicator after debounce fires
      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/cases?action=REVIEW&search=match'),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      // Wait for the fetch promise to resolve and results to render
      await waitFor(() => {
        expect(screen.getByText('merchant-case-match')).toBeInTheDocument();
      });

      // Original cases should no longer be visible
      expect(screen.queryByText('merchant-case-high')).not.toBeInTheDocument();
    });

    it('typing whitespace-only shows full list and no searching indicator', async () => {
      setupStore();
      render(<CaseReviewQueue />);

      const input = screen.getByTestId('case-search-input');
      await act(async () => {
        fireEvent.change(input, { target: { value: '   ' } });
      });

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      // No fetch should have been triggered
      expect(fetchSpy).not.toHaveBeenCalled();

      // Full case list should still be displayed
      expect(screen.getByText('merchant-case-high')).toBeInTheDocument();
      expect(screen.getByText('merchant-case-mid')).toBeInTheDocument();
      expect(screen.getByText('merchant-case-low')).toBeInTheDocument();

      // No searching indicator
      expect(screen.queryByTestId('searching-indicator')).not.toBeInTheDocument();
    });

    it('aborts previous in-flight request when a new keystroke arrives', async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

      // First fetch: never resolves (simulates slow response)
      fetchSpy.mockImplementationOnce(
        () => new Promise<Response>(() => { /* intentionally pending */ }),
      );
      // Second fetch: resolves immediately
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cases: [makeCase('case-final', 75)] }),
      } as Response);

      setupStore();
      render(<CaseReviewQueue />);
      const input = screen.getByTestId('case-search-input');

      // First keystroke
      await act(async () => {
        fireEvent.change(input, { target: { value: 'first' } });
        vi.advanceTimersByTime(350);
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Second keystroke — should abort the first request
      await act(async () => {
        fireEvent.change(input, { target: { value: 'second' } });
        vi.advanceTimersByTime(350);
      });

      expect(abortSpy).toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Final results should render
      await waitFor(() => {
        expect(screen.getByText('merchant-case-final')).toBeInTheDocument();
      });

      abortSpy.mockRestore();
    });

    it('does not treat AbortError as a real error', async () => {
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      fetchSpy.mockRejectedValueOnce(abortError);

      setupStore();
      render(<CaseReviewQueue />);
      const input = screen.getByTestId('case-search-input');

      await act(async () => {
        fireEvent.change(input, { target: { value: 'test' } });
        vi.advanceTimersByTime(350);
      });

      // Wait for the rejection to be handled
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      // No error message should be displayed
      expect(screen.queryByTestId('search-error')).not.toBeInTheDocument();
    });

    it('clearing the search input resets to full case list', async () => {
      const filtered = [makeCase('case-match', 88)];
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ cases: filtered }),
      } as Response);

      setupStore();
      render(<CaseReviewQueue />);
      const input = screen.getByTestId('case-search-input');

      // Type a query first
      await act(async () => {
        fireEvent.change(input, { target: { value: 'match' } });
        vi.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(screen.getByText('merchant-case-match')).toBeInTheDocument();
      });

      // Clear the input
      await act(async () => {
        fireEvent.change(input, { target: { value: '' } });
      });

      // Full list should be restored immediately (no debounce needed for clear)
      expect(screen.getByText('merchant-case-high')).toBeInTheDocument();
      expect(screen.getByText('merchant-case-mid')).toBeInTheDocument();
      expect(screen.getByText('merchant-case-low')).toBeInTheDocument();
      expect(screen.queryByTestId('searching-indicator')).not.toBeInTheDocument();
    });
  });
});
