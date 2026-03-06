import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CaseDetailPanel from '../components/cases/CaseDetailPanel';
import { useCasesStore } from '../store/cases.store';
import type { Case } from '../types/case.types';

vi.mock('../store/cases.store');

const mockCase: Case = {
  id: 'case-001',
  merchantId: 'merchant-001',
  decisionId: 'req-abc',
  entityId: 'user-xyz',
  action: 'REVIEW',
  riskScore: 65,
  riskFactors: [
    {
      signal: 'device.trustScore',
      value: 25,
      contribution: 40,
      description: 'Low trust score',
    },
  ],
  status: 'OPEN',
  priority: 'MEDIUM',
  slaDeadline: new Date(Date.now() + 3 * 3600_000).toISOString(),
  assignedTo: null,
  resolution: null,
  resolutionNotes: null,
  resolvedAt: null,
  createdAt: new Date(Date.now() - 1 * 3600_000).toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockResolveCase = vi.fn().mockResolvedValue(undefined);
const mockEscalateCase = vi.fn().mockResolvedValue(undefined);

function setupStore() {
  vi.mocked(useCasesStore).mockReturnValue({
    cases: [mockCase],
    total: 1,
    page: 1,
    filters: {},
    selectedIds: [],
    loading: false,
    fetchCases: vi.fn(),
    setFilter: vi.fn(),
    setPage: vi.fn(),
    toggleSelect: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    resolveCase: mockResolveCase,
    escalateCase: mockEscalateCase,
    bulkResolve: vi.fn(),
  });
}

describe('CaseDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStore();
  });

  it('renders case details when caseData is provided', () => {
    render(<CaseDetailPanel caseData={mockCase} onClose={vi.fn()} />);
    expect(screen.getByText('case-001')).toBeInTheDocument();
    expect(screen.getByText('user-xyz')).toBeInTheDocument();
    expect(screen.getByText('65')).toBeInTheDocument();
    expect(screen.getByText('Low trust score')).toBeInTheDocument();
  });

  it('shows resolution form when status is OPEN', () => {
    render(<CaseDetailPanel caseData={mockCase} onClose={vi.fn()} />);
    expect(screen.getByText('Submit Resolution')).toBeInTheDocument();
    expect(screen.getByLabelText('Decision')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
  });

  it('hides resolution form when status is RESOLVED', () => {
    const resolvedCase = { ...mockCase, status: 'RESOLVED' as const };
    render(<CaseDetailPanel caseData={resolvedCase} onClose={vi.fn()} />);
    expect(screen.queryByText('Submit Resolution')).not.toBeInTheDocument();
  });

  it('shows resolution form when status is IN_REVIEW', () => {
    const inReviewCase = { ...mockCase, status: 'IN_REVIEW' as const };
    render(<CaseDetailPanel caseData={inReviewCase} onClose={vi.fn()} />);
    expect(screen.getByText('Submit Resolution')).toBeInTheDocument();
  });

  it('calls resolveCase with correct args when submitted', async () => {
    const onClose = vi.fn();
    render(<CaseDetailPanel caseData={mockCase} onClose={onClose} />);

    const notesInput = screen.getByLabelText('Notes');
    fireEvent.change(notesInput, { target: { value: 'Test notes' } });

    fireEvent.click(screen.getByText('Submit Resolution'));

    await waitFor(() => {
      expect(mockResolveCase).toHaveBeenCalledWith('case-001', 'FRAUD', 'Test notes');
    });
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<CaseDetailPanel caseData={mockCase} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close panel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows escalate button when status is OPEN', () => {
    render(<CaseDetailPanel caseData={mockCase} onClose={vi.fn()} />);
    expect(screen.getByText('Escalate Case')).toBeInTheDocument();
  });

  it('calls escalateCase when escalate button is clicked', async () => {
    const onClose = vi.fn();
    render(<CaseDetailPanel caseData={mockCase} onClose={onClose} />);
    fireEvent.click(screen.getByText('Escalate Case'));
    await waitFor(() => {
      expect(mockEscalateCase).toHaveBeenCalledWith('case-001');
    });
  });

  it('evidenceTimeline with 3 items renders 3 list items', () => {
    const caseWithEvidence: Case = {
      ...mockCase,
      evidenceTimeline: [
        { timestamp: new Date(Date.now() - 3000).toISOString(), type: 'signal', description: 'High velocity detected' },
        { timestamp: new Date(Date.now() - 2000).toISOString(), type: 'rule_hit', description: 'Rule blocked transaction' },
        { timestamp: new Date(Date.now() - 1000).toISOString(), type: 'user_action', description: 'Analyst flagged account' },
      ],
    };
    render(<CaseDetailPanel caseData={caseWithEvidence} onClose={vi.fn()} />);
    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(3);
  });

  it('evidenceTimeline undefined shows "No evidence recorded"', () => {
    const caseWithoutEvidence: Case = {
      ...mockCase,
      evidenceTimeline: undefined,
    };
    render(<CaseDetailPanel caseData={caseWithoutEvidence} onClose={vi.fn()} />);
    expect(screen.getByText('No evidence recorded')).toBeInTheDocument();
  });
});
