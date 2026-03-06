/**
 * Tests for OverviewPage — KPI sequential polling, stale badge, visibilityChange
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Mock child components to avoid rendering heavy chart/socket dependencies
// ---------------------------------------------------------------------------

vi.mock('../../components/overview/KpiGrid', () => ({
  default: () => <div data-testid="kpi-grid" />,
}));

vi.mock('../../components/overview/TrendChart', () => ({
  default: () => <div data-testid="trend-chart" />,
}));

vi.mock('../../components/overview/EventStream', () => ({
  default: () => <div data-testid="event-stream" />,
}));

// ---------------------------------------------------------------------------
// Mock dashboard store
// ---------------------------------------------------------------------------

const mockFetchOverviewData = vi.fn();
const mockSetStale = vi.fn();

// Mutable store state — tests mutate these before rendering
let storeState = {
  isStale: false,
  lastUpdated: 0,
  fetchOverviewData: mockFetchOverviewData,
  setStale: mockSetStale,
};

// We need to mock both the hook call (useDashboardStore()) and the
// static getState() method used inside the useEffect polling logic.
vi.mock('../../store/dashboard.store', () => {
  const hook = vi.fn(() => storeState);
  // getState returns the same mutable storeState object so that
  // poll() picks up the current mockFetchOverviewData / mockSetStale.
  (hook as unknown as { getState: () => typeof storeState }).getState = vi.fn(
    () => storeState,
  );
  return { useDashboardStore: hook };
});

// Import after mocking
import OverviewPage from '../OverviewPage';
import { useDashboardStore } from '../../store/dashboard.store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OverviewPage — polling + stale badge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Reset store state to defaults
    storeState = {
      isStale: false,
      lastUpdated: 0,
      fetchOverviewData: mockFetchOverviewData,
      setStale: mockSetStale,
    };

    // Default: fetchOverviewData resolves immediately
    mockFetchOverviewData.mockResolvedValue(undefined);

    // Keep getState in sync with current storeState
    (
      useDashboardStore as unknown as { getState: () => typeof storeState }
    ).getState.mockImplementation(() => storeState);
    vi.mocked(useDashboardStore).mockImplementation(() => storeState);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: fetchOverviewData called on mount
  // -------------------------------------------------------------------------
  it('fetchOverviewData called on mount', async () => {
    renderPage();

    // Allow the async poll() to run
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetchOverviewData).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 2: setTimeout cleared on unmount (no leak)
  // -------------------------------------------------------------------------
  it('setTimeout cleared on unmount (no leak)', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const { unmount } = renderPage();

    // Let the initial poll complete and setTimeout scheduled
    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Test 3: Stale badge appears on failed poll
  // -------------------------------------------------------------------------
  it('Stale badge appears on failed poll', async () => {
    // Reject on first call
    mockFetchOverviewData.mockRejectedValueOnce(new Error('network error'));

    // Simulate setStale updating storeState.isStale
    mockSetStale.mockImplementation((isStale: boolean, lastUpdated?: number) => {
      storeState = {
        ...storeState,
        isStale,
        lastUpdated: lastUpdated ?? storeState.lastUpdated,
      };
      vi.mocked(useDashboardStore).mockImplementation(() => storeState);
    });

    const { rerender } = renderPage();

    // Allow the rejected poll to run
    await act(async () => {
      await Promise.resolve();
    });

    // Re-render to pick up updated storeState (setStale was called with true)
    rerender(
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>,
    );

    expect(mockSetStale).toHaveBeenCalledWith(true);
    expect(screen.getByText(/Offline/)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 4: Badge clears on next successful poll
  // -------------------------------------------------------------------------
  it('Badge clears on next successful poll', async () => {
    // Start with stale state
    storeState = { ...storeState, isStale: true, lastUpdated: Date.now() - 60_000 };
    vi.mocked(useDashboardStore).mockImplementation(() => storeState);

    // fetchOverviewData resolves (successful)
    mockFetchOverviewData.mockResolvedValue(undefined);

    // setStale clears the badge
    mockSetStale.mockImplementation((isStale: boolean, lastUpdated?: number) => {
      storeState = {
        ...storeState,
        isStale,
        lastUpdated: lastUpdated ?? storeState.lastUpdated,
      };
      vi.mocked(useDashboardStore).mockImplementation(() => storeState);
    });

    const { rerender } = renderPage();

    // Badge should be visible initially (isStale: true)
    expect(screen.getByText(/Offline/)).toBeInTheDocument();

    // Let the poll complete
    await act(async () => {
      await Promise.resolve();
    });

    // Re-render to reflect cleared stale state
    rerender(
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>,
    );

    expect(mockSetStale).toHaveBeenCalledWith(false, expect.any(Number));
    expect(screen.queryByText(/Offline/)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 5: visibilitychange triggers poll when data is stale >30s
  // -------------------------------------------------------------------------
  it('visibilitychange triggers poll when data is stale >30s', async () => {
    // Keep lastUpdated always at stale time (35s ago), even after setStale calls.
    // This simulates the scenario where the tab was hidden before a successful
    // poll happened and lastUpdated was never refreshed.
    const staleTime = Date.now() - 35_000;

    // Make getState always return staleTime so the onVisible guard passes
    (
      useDashboardStore as unknown as { getState: () => typeof storeState }
    ).getState.mockImplementation(() => ({
      ...storeState,
      lastUpdated: staleTime,
      fetchOverviewData: mockFetchOverviewData,
      setStale: mockSetStale,
    }));

    renderPage();

    // Let initial poll finish
    await act(async () => {
      await Promise.resolve();
    });

    const callCountAfterMount = mockFetchOverviewData.mock.calls.length;

    // Simulate tab becoming visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(mockFetchOverviewData.mock.calls.length).toBeGreaterThan(callCountAfterMount);
  });
});
