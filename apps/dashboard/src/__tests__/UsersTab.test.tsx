import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UsersTab from '../components/admin/UsersTab';
import { useAdminStore } from '../store/admin.store';
import type { AdminUser } from '../types/admin.types';

vi.mock('../store/admin.store');

const mockDeactivateUser = vi.fn().mockResolvedValue(undefined);
const mockInviteUser = vi.fn().mockResolvedValue(undefined);

const mockUsers: AdminUser[] = [
  {
    id: 'user-1',
    email: 'alice@example.com',
    role: 'admin',
    isActive: true,
    lastLoginAt: '2026-03-05T10:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'user-2',
    email: 'bob@example.com',
    role: 'analyst',
    isActive: false,
    lastLoginAt: null,
    createdAt: '2025-06-01T00:00:00Z',
  },
];

function setupStore(overrides: Partial<ReturnType<typeof useAdminStore>> = {}) {
  vi.mocked(useAdminStore).mockReturnValue({
    users: mockUsers,
    services: [],
    rules: [],
    isLoadingUsers: false,
    isLoadingServices: false,
    isLoadingRules: false,
    error: null,
    activeTab: 'users',
    setActiveTab: vi.fn(),
    fetchUsers: vi.fn(),
    inviteUser: mockInviteUser,
    deactivateUser: mockDeactivateUser,
    fetchServiceHealth: vi.fn(),
    startHealthPolling: vi.fn().mockReturnValue(vi.fn()),
    fetchRules: vi.fn(),
    updateRuleWeight: vi.fn(),
    updateRuleExpression: vi.fn(),
    ...overrides,
  });
}

describe('UsersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders user table with mock data', () => {
    setupStore();
    render(<UsersTab />);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('shows role labels in table', () => {
    setupStore();
    render(<UsersTab />);
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Analyst')).toBeInTheDocument();
  });

  it('shows active/inactive badges', () => {
    setupStore();
    render(<UsersTab />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('shows loading skeleton when isLoadingUsers is true', () => {
    setupStore({ isLoadingUsers: true });
    render(<UsersTab />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('Deactivate button shows confirm text on first click', () => {
    setupStore();
    render(<UsersTab />);
    const deactivateBtn = screen.getByText('Deactivate');
    fireEvent.click(deactivateBtn);
    expect(screen.getByText('Deactivate?')).toBeInTheDocument();
  });

  it('clicking Deactivate twice calls deactivateUser', async () => {
    setupStore();
    render(<UsersTab />);
    const deactivateBtn = screen.getByText('Deactivate');
    fireEvent.click(deactivateBtn);
    const confirmBtn = screen.getByText('Deactivate?');
    fireEvent.click(confirmBtn);
    expect(mockDeactivateUser).toHaveBeenCalledWith('user-1');
  });

  it('Invite User button opens InviteUserModal', () => {
    setupStore();
    render(<UsersTab />);
    fireEvent.click(screen.getByText('Invite User'));
    expect(screen.getByRole('dialog', { name: 'Invite User' })).toBeInTheDocument();
  });

  it('shows "Never" for users with null lastLoginAt', () => {
    setupStore();
    render(<UsersTab />);
    expect(screen.getByText('Never')).toBeInTheDocument();
  });
});
