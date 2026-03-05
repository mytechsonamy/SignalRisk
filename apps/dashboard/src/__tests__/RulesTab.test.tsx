import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RulesTab from '../components/admin/RulesTab';
import { useAdminStore } from '../store/admin.store';
import type { Rule } from '../types/admin.types';

vi.mock('../store/admin.store');

const mockUpdateRuleWeight = vi.fn().mockResolvedValue(undefined);
const mockUpdateRuleExpression = vi.fn().mockResolvedValue(undefined);

const mockRules: Rule[] = [
  {
    id: 'rule-1',
    name: 'High Risk Block',
    expression: 'trustScore < 30 AND velocity > 100',
    outcome: 'BLOCK',
    weight: 0.9,
    isActive: true,
  },
  {
    id: 'rule-2',
    name: 'Medium Risk Review',
    expression: 'trustScore < 60 AND velocity > 50',
    outcome: 'REVIEW',
    weight: 0.6,
    isActive: true,
  },
  {
    id: 'rule-3',
    name: 'Low Risk Allow',
    expression: 'trustScore >= 80',
    outcome: 'ALLOW',
    weight: 0.3,
    isActive: false,
  },
];

function setupStore(overrides: Partial<ReturnType<typeof useAdminStore>> = {}) {
  vi.mocked(useAdminStore).mockReturnValue({
    users: [],
    services: [],
    rules: mockRules,
    isLoadingUsers: false,
    isLoadingServices: false,
    isLoadingRules: false,
    error: null,
    activeTab: 'rules',
    setActiveTab: vi.fn(),
    fetchUsers: vi.fn(),
    inviteUser: vi.fn(),
    deactivateUser: vi.fn(),
    fetchServiceHealth: vi.fn(),
    startHealthPolling: vi.fn().mockReturnValue(vi.fn()),
    fetchRules: vi.fn(),
    updateRuleWeight: mockUpdateRuleWeight,
    updateRuleExpression: mockUpdateRuleExpression,
    ...overrides,
  });
}

describe('RulesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders rule rows with name, expression, outcome, and weight', () => {
    setupStore();
    render(<RulesTab />);
    expect(screen.getByText('High Risk Block')).toBeInTheDocument();
    expect(screen.getByText('Medium Risk Review')).toBeInTheDocument();
    expect(screen.getByText('Low Risk Allow')).toBeInTheDocument();
  });

  it('renders outcome badges with correct values', () => {
    setupStore();
    render(<RulesTab />);
    expect(screen.getByText('BLOCK')).toBeInTheDocument();
    expect(screen.getByText('REVIEW')).toBeInTheDocument();
    expect(screen.getByText('ALLOW')).toBeInTheDocument();
  });

  it('truncates expression text longer than 60 chars', () => {
    const longExpression = 'a'.repeat(70);
    setupStore({
      rules: [
        {
          ...mockRules[0],
          expression: longExpression,
        },
      ],
    });
    render(<RulesTab />);
    // Should be truncated to 60 chars + ellipsis
    expect(screen.getByTitle(longExpression)).toBeInTheDocument();
    const truncatedText = screen.getByTitle(longExpression).textContent;
    expect(truncatedText?.length).toBeLessThanOrEqual(62); // 60 chars + ellipsis char
  });

  it('Edit button opens EditRuleModal', () => {
    setupStore();
    render(<RulesTab />);
    const editButtons = screen.getAllByRole('button', { name: /Edit rule/i });
    fireEvent.click(editButtons[0]);
    expect(screen.getByRole('dialog', { name: 'Edit Rule' })).toBeInTheDocument();
  });

  it('shows loading skeleton when isLoadingRules is true', () => {
    setupStore({ isLoadingRules: true });
    render(<RulesTab />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('renders weight sliders for each rule', () => {
    setupStore();
    render(<RulesTab />);
    // Each rule has a weight slider
    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(mockRules.length);
  });

  it('weight slider change calls updateRuleWeight after debounce', async () => {
    vi.useFakeTimers();
    setupStore();
    render(<RulesTab />);
    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '0.5' } });
    vi.advanceTimersByTime(600);
    expect(mockUpdateRuleWeight).toHaveBeenCalledWith('rule-1', 0.5);
    vi.useRealTimers();
  });

  it('shows active status for rules', () => {
    setupStore();
    render(<RulesTab />);
    const yesStatuses = screen.getAllByText('Yes');
    expect(yesStatuses).toHaveLength(2); // 2 active rules
    expect(screen.getByText('No')).toBeInTheDocument();
  });
});
