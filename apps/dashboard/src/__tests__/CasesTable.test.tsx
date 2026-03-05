import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CasesTable from '../components/cases/CasesTable';
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

const mockToggleSelect = vi.fn();
const mockSelectAll = vi.fn();
const mockClearSelection = vi.fn();

function setupStore(overrides: Partial<ReturnType<typeof useCasesStore>> = {}) {
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
    toggleSelect: mockToggleSelect,
    selectAll: mockSelectAll,
    clearSelection: mockClearSelection,
    resolveCase: vi.fn(),
    escalateCase: vi.fn(),
    bulkResolve: vi.fn(),
    ...overrides,
  });
}

describe('CasesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders case rows with correct data', () => {
    setupStore();
    render(<CasesTable onView={vi.fn()} />);
    expect(screen.getByText('user-xyz')).toBeInTheDocument();
    expect(screen.getByText('REVIEW')).toBeInTheDocument();
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
    expect(screen.getByText('65')).toBeInTheDocument();
  });

  it('clicking the row checkbox calls toggleSelect', () => {
    setupStore();
    render(<CasesTable onView={vi.fn()} />);
    const checkbox = screen.getByLabelText('Select case case-001');
    fireEvent.click(checkbox);
    expect(mockToggleSelect).toHaveBeenCalledWith('case-001');
  });

  it('clicking "View" button triggers onView callback with case ID', () => {
    setupStore();
    const onView = vi.fn();
    render(<CasesTable onView={onView} />);
    fireEvent.click(screen.getByText('View'));
    expect(onView).toHaveBeenCalledWith('case-001');
  });

  it('shows empty state when no cases', () => {
    setupStore({ cases: [] });
    render(<CasesTable onView={vi.fn()} />);
    expect(screen.getByText('No cases found')).toBeInTheDocument();
  });

  it('select-all checkbox calls selectAll', () => {
    setupStore();
    render(<CasesTable onView={vi.fn()} />);
    const selectAll = screen.getByLabelText('Select all cases');
    fireEvent.click(selectAll);
    expect(mockSelectAll).toHaveBeenCalled();
  });

  it('select-all when all selected calls clearSelection', () => {
    setupStore({ selectedIds: ['case-001'] });
    render(<CasesTable onView={vi.fn()} />);
    const selectAll = screen.getByLabelText('Select all cases');
    fireEvent.click(selectAll);
    expect(mockClearSelection).toHaveBeenCalled();
  });
});
