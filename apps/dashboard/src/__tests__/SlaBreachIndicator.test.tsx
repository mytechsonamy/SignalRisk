import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CasesTable from '../components/cases/CasesTable';
import { useCasesStore } from '../store/cases.store';
import type { Case } from '../types/case.types';

vi.mock('../store/cases.store');

const baseCase: Case = {
  id: 'case-001',
  merchantId: 'merchant-001',
  decisionId: 'req-abc',
  entityId: 'user-xyz',
  action: 'REVIEW',
  riskScore: 65,
  riskFactors: [],
  status: 'OPEN',
  priority: 'MEDIUM',
  slaDeadline: new Date(Date.now() + 3 * 3600_000).toISOString(),
  slaBreached: false,
  assignedTo: null,
  resolution: null,
  resolutionNotes: null,
  resolvedAt: null,
  createdAt: new Date(Date.now() - 1 * 3600_000).toISOString(),
  updatedAt: new Date().toISOString(),
};

function setupStore(cases: Case[]) {
  vi.mocked(useCasesStore).mockReturnValue({
    cases,
    total: cases.length,
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
    resolveCase: vi.fn(),
    escalateCase: vi.fn(),
    bulkResolve: vi.fn(),
  });
}

describe('SlaBreachIndicator in CasesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show "SLA Breached" badge when slaBreached is true', () => {
    const breachedCase: Case = { ...baseCase, slaBreached: true };
    setupStore([breachedCase]);
    render(<CasesTable onView={vi.fn()} />);
    expect(screen.getByText('SLA Breached')).toBeInTheDocument();
  });

  it('should NOT show "SLA Breached" badge when slaBreached is false', () => {
    const normalCase: Case = { ...baseCase, slaBreached: false };
    setupStore([normalCase]);
    render(<CasesTable onView={vi.fn()} />);
    expect(screen.queryByText('SLA Breached')).not.toBeInTheDocument();
  });

  it('should NOT show "SLA Breached" badge when slaBreached is undefined', () => {
    const normalCase: Case = { ...baseCase, slaBreached: undefined };
    setupStore([normalCase]);
    render(<CasesTable onView={vi.fn()} />);
    expect(screen.queryByText('SLA Breached')).not.toBeInTheDocument();
  });

  it('should apply animate-pulse text-red-500 classes to the breach badge', () => {
    const breachedCase: Case = { ...baseCase, slaBreached: true };
    setupStore([breachedCase]);
    render(<CasesTable onView={vi.fn()} />);
    const badge = screen.getByLabelText('SLA Breached');
    expect(badge).toHaveClass('animate-pulse');
    expect(badge).toHaveClass('text-red-500');
  });

  it('should show breach badge with correct aria-label for accessibility', () => {
    const breachedCase: Case = { ...baseCase, slaBreached: true };
    setupStore([breachedCase]);
    render(<CasesTable onView={vi.fn()} />);
    expect(screen.getByLabelText('SLA Breached')).toBeInTheDocument();
  });

  it('should still show priority badge alongside SLA breach badge', () => {
    const breachedCase: Case = { ...baseCase, slaBreached: true, priority: 'HIGH' };
    setupStore([breachedCase]);
    render(<CasesTable onView={vi.fn()} />);
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('SLA Breached')).toBeInTheDocument();
  });
});
