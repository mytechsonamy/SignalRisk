import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPage from '../pages/AdminPage';
import { useAdminStore } from '../store/admin.store';
import { useAuthStore } from '../store/auth.store';

vi.mock('../store/admin.store');
vi.mock('../store/auth.store');

// Mock child tab components so tests stay focused on AdminPage logic
vi.mock('../components/admin/UsersTab', () => ({
  default: () => <div data-testid="users-tab">UsersTab</div>,
}));
vi.mock('../components/admin/SystemHealthTab', () => ({
  default: () => <div data-testid="health-tab">SystemHealthTab</div>,
}));
vi.mock('../components/admin/RulesTab', () => ({
  default: () => <div data-testid="rules-tab">RulesTab</div>,
}));

const mockSetActiveTab = vi.fn();
const mockFetchUsers = vi.fn().mockResolvedValue(undefined);
const mockFetchRules = vi.fn().mockResolvedValue(undefined);

function setupAdminStore(overrides: Partial<ReturnType<typeof useAdminStore>> = {}) {
  vi.mocked(useAdminStore).mockReturnValue({
    users: [],
    services: [],
    rules: [],
    isLoadingUsers: false,
    isLoadingServices: false,
    isLoadingRules: false,
    error: null,
    activeTab: 'users',
    setActiveTab: mockSetActiveTab,
    fetchUsers: mockFetchUsers,
    fetchRules: mockFetchRules,
    inviteUser: vi.fn(),
    deactivateUser: vi.fn(),
    fetchServiceHealth: vi.fn(),
    startHealthPolling: vi.fn().mockReturnValue(vi.fn()),
    updateRuleWeight: vi.fn(),
    updateRuleExpression: vi.fn(),
    ...overrides,
  });
}

function setupAuthStore(role: 'admin' | 'analyst' | 'viewer' = 'admin') {
  vi.mocked(useAuthStore).mockReturnValue({
    user: { id: '1', email: 'admin@test.com', role },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    initFromStorage: vi.fn(),
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AdminPage />
    </MemoryRouter>,
  );
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page heading', () => {
    setupAdminStore();
    setupAuthStore('admin');
    renderPage();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('renders 3 tab buttons', () => {
    setupAdminStore();
    setupAuthStore('admin');
    renderPage();
    expect(screen.getByRole('tab', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'System Health' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Rules' })).toBeInTheDocument();
  });

  it('defaults to users tab and renders UsersTab component', () => {
    setupAdminStore({ activeTab: 'users' });
    setupAuthStore('admin');
    renderPage();
    expect(screen.getByTestId('users-tab')).toBeInTheDocument();
  });

  it('clicking System Health tab calls setActiveTab with "health"', () => {
    setupAdminStore();
    setupAuthStore('admin');
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'System Health' }));
    expect(mockSetActiveTab).toHaveBeenCalledWith('health');
  });

  it('clicking Rules tab calls setActiveTab with "rules"', () => {
    setupAdminStore();
    setupAuthStore('admin');
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Rules' }));
    expect(mockSetActiveTab).toHaveBeenCalledWith('rules');
  });

  it('renders SystemHealthTab when activeTab is health', () => {
    setupAdminStore({ activeTab: 'health' });
    setupAuthStore('admin');
    renderPage();
    expect(screen.getByTestId('health-tab')).toBeInTheDocument();
  });

  it('renders RulesTab when activeTab is rules', () => {
    setupAdminStore({ activeTab: 'rules' });
    setupAuthStore('admin');
    renderPage();
    expect(screen.getByTestId('rules-tab')).toBeInTheDocument();
  });

  it('non-admin user (viewer) sees redirect to /unauthorized', () => {
    setupAdminStore();
    setupAuthStore('viewer');
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminPage />
      </MemoryRouter>,
    );
    // Navigate redirects, no admin content rendered
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('error banner shows when error is not null', () => {
    setupAdminStore({ error: 'Failed to load admin data' });
    setupAuthStore('admin');
    renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to load admin data')).toBeInTheDocument();
  });

  it('no error banner when error is null', () => {
    setupAdminStore({ error: null });
    setupAuthStore('admin');
    renderPage();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
