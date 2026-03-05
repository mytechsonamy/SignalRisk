import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BulkActionBar from '../components/cases/BulkActionBar';
import { useCasesStore } from '../store/cases.store';

vi.mock('../store/cases.store');

const mockBulkResolve = vi.fn();
const mockClearSelection = vi.fn();

function setupStore(selectedIds: string[]) {
  vi.mocked(useCasesStore).mockReturnValue({
    cases: [],
    total: 0,
    page: 1,
    filters: {},
    selectedIds,
    loading: false,
    fetchCases: vi.fn(),
    setFilter: vi.fn(),
    setPage: vi.fn(),
    toggleSelect: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: mockClearSelection,
    resolveCase: vi.fn(),
    escalateCase: vi.fn(),
    bulkResolve: mockBulkResolve,
  });
}

describe('BulkActionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no cases are selected', () => {
    setupStore([]);
    const { container } = render(<BulkActionBar />);
    expect(container.firstChild).toBeNull();
  });

  it('shows count of selected cases', () => {
    setupStore(['case-001', 'case-002', 'case-003']);
    render(<BulkActionBar />);
    expect(screen.getByText('3 cases selected')).toBeInTheDocument();
  });

  it('shows singular "case" when only 1 is selected', () => {
    setupStore(['case-001']);
    render(<BulkActionBar />);
    expect(screen.getByText('1 case selected')).toBeInTheDocument();
  });

  it('"Resolve as Fraud" calls bulkResolve with FRAUD', () => {
    setupStore(['case-001', 'case-002']);
    render(<BulkActionBar />);
    fireEvent.click(screen.getByText('Resolve as Fraud'));
    expect(mockBulkResolve).toHaveBeenCalledWith('FRAUD');
  });

  it('"Resolve as Legitimate" calls bulkResolve with LEGITIMATE', () => {
    setupStore(['case-001', 'case-002']);
    render(<BulkActionBar />);
    fireEvent.click(screen.getByText('Resolve as Legitimate'));
    expect(mockBulkResolve).toHaveBeenCalledWith('LEGITIMATE');
  });

  it('"Clear" button calls clearSelection', () => {
    setupStore(['case-001']);
    render(<BulkActionBar />);
    fireEvent.click(screen.getByText('Clear'));
    expect(mockClearSelection).toHaveBeenCalled();
  });
});
