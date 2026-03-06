/**
 * Tests for LiveFeedPage — real-time WebSocket decision monitoring
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Mock socket.io-client
// ---------------------------------------------------------------------------

// Event listeners registered via socket.on(event, handler)
type EventHandler = (data: unknown) => void;

// Use vi.hoisted so variables are available when vi.mock factory is hoisted
const { mockIo, mockSocket } = vi.hoisted(() => {
  const listeners: Record<string, EventHandler[]> = {};
  const socket = {
    on: vi.fn((event: string, handler: EventHandler) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    disconnect: vi.fn(),
    connected: true,
    _listeners: listeners,
  };
  const io = vi.fn(() => socket);
  return { mockIo: io, mockSocket: socket };
});

vi.mock('socket.io-client', () => ({
  io: mockIo,
}));

// Helper: emit a mock WebSocket event using the hoisted socket listeners
function emitSocketEvent(event: string, data: unknown) {
  const listeners = mockSocket._listeners[event] ?? [];
  listeners.forEach((handler) => handler(data));
}

// ---------------------------------------------------------------------------
// Import component after mocking
// ---------------------------------------------------------------------------

import LiveFeedPage, { DecisionEvent } from '../pages/LiveFeedPage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides?: Partial<DecisionEvent>): DecisionEvent {
  return {
    decisionId: `dec-${Math.random().toString(36).slice(2)}`,
    merchantId: 'merchant-001',
    entityId: 'entity-001',
    action: 'ALLOW',
    riskScore: 25,
    timestamp: new Date().toISOString(),
    topRiskFactors: ['device.trustScore'],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LiveFeedPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LiveFeedPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear listener registry between tests
    Object.keys(mockSocket._listeners).forEach((k) => {
      delete mockSocket._listeners[k];
    });
    // Re-register the on() implementation using the hoisted listeners map
    mockSocket.on.mockImplementation((event: string, handler: EventHandler) => {
      if (!mockSocket._listeners[event]) mockSocket._listeners[event] = [];
      mockSocket._listeners[event].push(handler);
    });
    mockIo.mockReturnValue(mockSocket);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Live Feed heading', () => {
    renderPage();
    expect(screen.getByText('Live Feed')).toBeInTheDocument();
  });

  it('renders decision counter initialized to 0 for all actions', () => {
    renderPage();
    const counter = screen.getByTestId('decision-counter');
    expect(counter).toBeInTheDocument();
    // All counters should show 0
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3);
  });

  it('ALLOW counter starts at 0', () => {
    renderPage();
    const allowCounter = screen.getByTestId('counter-allow');
    expect(allowCounter).toHaveTextContent('0');
  });

  it('REVIEW counter starts at 0', () => {
    renderPage();
    const reviewCounter = screen.getByTestId('counter-review');
    expect(reviewCounter).toHaveTextContent('0');
  });

  it('BLOCK counter starts at 0', () => {
    renderPage();
    const blockCounter = screen.getByTestId('counter-block');
    expect(blockCounter).toHaveTextContent('0');
  });

  it('receives a decision event and adds it to the list', async () => {
    renderPage();
    const event = makeEvent({ entityId: 'entity-xyz', action: 'ALLOW' });

    act(() => {
      emitSocketEvent('decision', event);
    });

    expect(screen.getByText('entity-xyz')).toBeInTheDocument();
  });

  it('receiving a decision event increments the correct counter', async () => {
    renderPage();
    const event = makeEvent({ action: 'BLOCK', riskScore: 80 });

    act(() => {
      emitSocketEvent('decision', event);
    });

    const blockCounter = screen.getByTestId('counter-block');
    expect(blockCounter).toHaveTextContent('1');
  });

  it('receiving multiple events increments counters independently', async () => {
    renderPage();

    act(() => {
      emitSocketEvent('decision', makeEvent({ action: 'ALLOW' }));
      emitSocketEvent('decision', makeEvent({ action: 'ALLOW' }));
      emitSocketEvent('decision', makeEvent({ action: 'REVIEW' }));
      emitSocketEvent('decision', makeEvent({ action: 'BLOCK' }));
    });

    expect(screen.getByTestId('counter-allow')).toHaveTextContent('2');
    expect(screen.getByTestId('counter-review')).toHaveTextContent('1');
    expect(screen.getByTestId('counter-block')).toHaveTextContent('1');
  });

  it('pause button stops adding events to the displayed list', async () => {
    renderPage();

    // Add one event before pausing
    act(() => {
      emitSocketEvent('decision', makeEvent({ entityId: 'entity-before-pause' }));
    });

    // Pause
    const pauseButton = screen.getByTestId('pause-resume-button');
    fireEvent.click(pauseButton);

    // Add event while paused
    act(() => {
      emitSocketEvent('decision', makeEvent({ entityId: 'entity-while-paused' }));
    });

    // entity-before-pause should be visible
    expect(screen.getByText('entity-before-pause')).toBeInTheDocument();
    // entity-while-paused should NOT be in the displayed list
    expect(screen.queryByText('entity-while-paused')).not.toBeInTheDocument();
  });

  it('counter still increments when paused', async () => {
    renderPage();

    // Pause
    const pauseButton = screen.getByTestId('pause-resume-button');
    fireEvent.click(pauseButton);

    // Emit events while paused
    act(() => {
      emitSocketEvent('decision', makeEvent({ action: 'BLOCK' }));
      emitSocketEvent('decision', makeEvent({ action: 'BLOCK' }));
    });

    // Counter should show 2 even though list is paused
    const blockCounter = screen.getByTestId('counter-block');
    expect(blockCounter).toHaveTextContent('2');
  });

  it('shows "Feed paused" indicator when paused', () => {
    renderPage();
    const pauseButton = screen.getByTestId('pause-resume-button');
    fireEvent.click(pauseButton);
    expect(screen.getByTestId('paused-indicator')).toBeInTheDocument();
  });

  it('resume button shows queued events after being paused', async () => {
    renderPage();

    // Pause
    const pauseButton = screen.getByTestId('pause-resume-button');
    fireEvent.click(pauseButton);

    // Emit while paused
    act(() => {
      emitSocketEvent('decision', makeEvent({ entityId: 'queued-entity' }));
    });

    // Not visible yet
    expect(screen.queryByText('queued-entity')).not.toBeInTheDocument();

    // Resume
    fireEvent.click(pauseButton);

    // Should now be visible
    expect(screen.getByText('queued-entity')).toBeInTheDocument();
  });

  it('filter by BLOCK shows only BLOCK events', async () => {
    renderPage();

    act(() => {
      emitSocketEvent('decision', makeEvent({ entityId: 'allow-entity', action: 'ALLOW' }));
      emitSocketEvent('decision', makeEvent({ entityId: 'block-entity', action: 'BLOCK' }));
    });

    // Apply BLOCK filter
    const select = screen.getByLabelText('Filter by action');
    fireEvent.change(select, { target: { value: 'BLOCK' } });

    expect(screen.queryByText('allow-entity')).not.toBeInTheDocument();
    expect(screen.getByText('block-entity')).toBeInTheDocument();
  });

  it('filter by merchantId shows only matching events', async () => {
    renderPage();

    act(() => {
      emitSocketEvent('decision', makeEvent({ entityId: 'entity-a', merchantId: 'merchant-abc' }));
      emitSocketEvent('decision', makeEvent({ entityId: 'entity-b', merchantId: 'merchant-xyz' }));
    });

    const merchantInput = screen.getByLabelText('Filter by merchant ID');
    fireEvent.change(merchantInput, { target: { value: 'abc' } });

    expect(screen.getByText('entity-a')).toBeInTheDocument();
    expect(screen.queryByText('entity-b')).not.toBeInTheDocument();
  });

  it('event list is capped at 100 events', async () => {
    renderPage();

    act(() => {
      for (let i = 0; i < 101; i++) {
        emitSocketEvent('decision', makeEvent({ entityId: `entity-${i}` }));
      }
    });

    const eventRows = screen.getAllByTestId('event-row');
    expect(eventRows.length).toBeLessThanOrEqual(100);
  });

  it('connects to socket.io with auth token from localStorage', () => {
    localStorage.setItem('token', 'my-test-token');
    renderPage();
    expect(mockIo).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ auth: { token: 'my-test-token' } }),
    );
    localStorage.removeItem('token');
  });

  it('renders filter bar with action dropdown and merchant ID input', () => {
    renderPage();
    expect(screen.getByLabelText('Filter by action')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by merchant ID')).toBeInTheDocument();
  });

  it('renders pause/resume button', () => {
    renderPage();
    expect(screen.getByTestId('pause-resume-button')).toBeInTheDocument();
    expect(screen.getByText('Pause')).toBeInTheDocument();
  });

  it('displays empty state initially', () => {
    renderPage();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });
});
