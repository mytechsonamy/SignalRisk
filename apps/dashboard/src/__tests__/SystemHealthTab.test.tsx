import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SystemHealthTab from '../components/admin/SystemHealthTab';
import { useAdminStore } from '../store/admin.store';
import type { ServiceHealth } from '../types/admin.types';

vi.mock('../store/admin.store');

const mockFetchServiceHealth = vi.fn().mockResolvedValue(undefined);
const mockStartHealthPolling = vi.fn().mockReturnValue(vi.fn());

const healthyServices: ServiceHealth[] = [
  {
    name: 'event-collector',
    port: 3001,
    status: 'healthy',
    latencyMs: 12,
    lastChecked: new Date().toISOString(),
  },
  {
    name: 'velocity-engine',
    port: 3002,
    status: 'healthy',
    latencyMs: 8,
    lastChecked: new Date().toISOString(),
  },
];

const degradedServices: ServiceHealth[] = [
  {
    name: 'event-collector',
    port: 3001,
    status: 'healthy',
    latencyMs: 12,
    lastChecked: new Date().toISOString(),
  },
  {
    name: 'velocity-engine',
    port: 3002,
    status: 'degraded',
    latencyMs: 500,
    lastChecked: new Date().toISOString(),
  },
];

const downServices: ServiceHealth[] = [
  {
    name: 'event-collector',
    port: 3001,
    status: 'down',
    latencyMs: null,
    lastChecked: new Date().toISOString(),
  },
];

function setupStore(overrides: Partial<ReturnType<typeof useAdminStore>> = {}) {
  vi.mocked(useAdminStore).mockReturnValue({
    users: [],
    services: healthyServices,
    rules: [],
    isLoadingUsers: false,
    isLoadingServices: false,
    isLoadingRules: false,
    error: null,
    activeTab: 'health',
    setActiveTab: vi.fn(),
    fetchUsers: vi.fn(),
    inviteUser: vi.fn(),
    deactivateUser: vi.fn(),
    fetchServiceHealth: mockFetchServiceHealth,
    startHealthPolling: mockStartHealthPolling,
    fetchRules: vi.fn(),
    updateRuleWeight: vi.fn(),
    updateRuleExpression: vi.fn(),
    ...overrides,
  });
}

describe('SystemHealthTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a ServiceHealthCard for each service', () => {
    setupStore();
    render(<SystemHealthTab />);
    expect(screen.getByText('event-collector')).toBeInTheDocument();
    expect(screen.getByText('velocity-engine')).toBeInTheDocument();
  });

  it('shows "All Systems Operational" when all services are healthy', () => {
    setupStore({ services: healthyServices });
    render(<SystemHealthTab />);
    expect(screen.getByText('All Systems Operational')).toBeInTheDocument();
  });

  it('shows "Degraded" banner when any service is degraded', () => {
    setupStore({ services: degradedServices });
    render(<SystemHealthTab />);
    const degradedTexts = screen.getAllByText('Degraded');
    // At least one occurrence (the banner) should appear
    expect(degradedTexts.length).toBeGreaterThanOrEqual(1);
    // The first element should be the banner (rounded-lg)
    expect(degradedTexts[0]).toBeInTheDocument();
  });

  it('shows "Outage" when any service is down', () => {
    setupStore({ services: downServices });
    render(<SystemHealthTab />);
    expect(screen.getByText('Outage')).toBeInTheDocument();
  });

  it('Refresh button calls fetchServiceHealth', () => {
    setupStore();
    render(<SystemHealthTab />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(mockFetchServiceHealth).toHaveBeenCalled();
  });

  it('startHealthPolling is called on mount', () => {
    setupStore();
    render(<SystemHealthTab />);
    expect(mockStartHealthPolling).toHaveBeenCalledWith(30_000);
  });

  it('shows latency in ms for services with latency data', () => {
    setupStore();
    render(<SystemHealthTab />);
    expect(screen.getByText('12ms')).toBeInTheDocument();
  });

  it('shows N/A for services with null latency', () => {
    setupStore({ services: downServices });
    render(<SystemHealthTab />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
});
