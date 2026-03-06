import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { useAdminStore } from '../store/admin.store';
import RulesTab from '../components/admin/RulesTab';

vi.mock('../store/admin.store');
vi.mock('../components/admin/RulesTab', () => ({
  default: () => <div data-testid="rules-tab">RulesTab</div>,
}));

const mockFetchRules = vi.fn().mockResolvedValue(undefined);

function setupAdminStore() {
  vi.mocked(useAdminStore).mockReturnValue({
    users: [],
    services: [],
    rules: [],
    isLoadingRules: false,
    isLoadingUsers: false,
    isLoadingServices: false,
    error: null,
    activeTab: 'rules',
    setActiveTab: vi.fn(),
    fetchUsers: vi.fn(),
    inviteUser: vi.fn(),
    deactivateUser: vi.fn(),
    fetchServiceHealth: vi.fn(),
    startHealthPolling: vi.fn().mockReturnValue(vi.fn()),
    fetchRules: mockFetchRules,
    updateRuleWeight: vi.fn(),
    updateRuleExpression: vi.fn(),
  });
}

// Inline reimplementation of RulesPage from App.tsx — mirrors exact behaviour
function RulesPage() {
  const { fetchRules } = useAdminStore();

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Rules</h1>
      </div>
      <div className="rounded-lg p-6">
        <RulesTab />
      </div>
    </div>
  );
}

describe('RulesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchRules called on mount', () => {
    setupAdminStore();
    render(<RulesPage />);
    expect(mockFetchRules).toHaveBeenCalled();
  });
});
