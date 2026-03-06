/**
 * LiveFeedPage — Real-time WebSocket decision monitoring
 *
 * Connects to the decision-service WebSocket and displays
 * a live stream of fraud decisions as they are made.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecisionEvent {
  decisionId: string;
  merchantId: string;
  entityId: string;
  action: 'ALLOW' | 'REVIEW' | 'BLOCK';
  riskScore: number;
  timestamp: string;
  topRiskFactors: string[];
}

type FilterAction = 'ALL' | 'ALLOW' | 'REVIEW' | 'BLOCK';

interface Counts {
  ALLOW: number;
  REVIEW: number;
  BLOCK: number;
}

const MAX_EVENTS = 100;
const WS_URL = (import.meta as { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL ?? 'http://localhost:3008';

function getToken(): string {
  return localStorage.getItem('token') ?? '';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DecisionCounter({ counts }: { counts: Counts }) {
  return (
    <div className="flex gap-4" data-testid="decision-counter">
      <div
        className="flex-1 rounded-lg bg-green-50 border border-green-200 p-4 text-center"
        data-testid="counter-allow"
      >
        <p className="text-2xl font-bold text-green-700">{counts.ALLOW}</p>
        <p className="text-sm font-medium text-green-600 mt-1">ALLOW</p>
      </div>
      <div
        className="flex-1 rounded-lg bg-amber-50 border border-amber-200 p-4 text-center"
        data-testid="counter-review"
      >
        <p className="text-2xl font-bold text-amber-700">{counts.REVIEW}</p>
        <p className="text-sm font-medium text-amber-600 mt-1">REVIEW</p>
      </div>
      <div
        className="flex-1 rounded-lg bg-red-50 border border-red-200 p-4 text-center"
        data-testid="counter-block"
      >
        <p className="text-2xl font-bold text-red-700">{counts.BLOCK}</p>
        <p className="text-sm font-medium text-red-600 mt-1">BLOCK</p>
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: 'ALLOW' | 'REVIEW' | 'BLOCK' }) {
  const classes: Record<string, string> = {
    ALLOW:  'bg-green-100 text-green-800',
    REVIEW: 'bg-amber-100 text-amber-800',
    BLOCK:  'bg-red-100 text-red-800',
  };
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${classes[action] ?? ''}`}
    >
      {action}
    </span>
  );
}

function RiskBar({ score }: { score: number }) {
  const color =
    score >= 70 ? 'bg-red-500' :
    score >= 40 ? 'bg-amber-500' :
    'bg-green-500';

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-2 rounded-full bg-gray-200">
        <div
          className={`h-2 rounded-full ${color} transition-all`}
          style={{ width: `${score}%` }}
          aria-label={`Risk score ${score}`}
        />
      </div>
      <span className="text-xs text-gray-600 w-6">{score}</span>
    </div>
  );
}

function EventRow({ event }: { event: DecisionEvent }) {
  const date = new Date(event.timestamp);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <li
      className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 text-sm"
      data-testid="event-row"
    >
      <span className="text-xs text-gray-400 w-20 shrink-0 font-mono">{timeStr}</span>
      <span className="text-gray-700 w-32 shrink-0 truncate font-mono text-xs">{event.entityId}</span>
      <span className="text-gray-500 w-28 shrink-0 truncate text-xs">{event.merchantId}</span>
      <span className="w-20 shrink-0">
        <ActionBadge action={event.action} />
      </span>
      <div className="w-28 shrink-0">
        <RiskBar score={event.riskScore} />
      </div>
      <div className="flex flex-wrap gap-1 min-w-0">
        {event.topRiskFactors.map((factor) => (
          <span
            key={factor}
            className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
          >
            {factor}
          </span>
        ))}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// LiveFeedPage
// ---------------------------------------------------------------------------

export default function LiveFeedPage() {
  const [events, setEvents] = useState<DecisionEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [filterAction, setFilterAction] = useState<FilterAction>('ALL');
  const [filterMerchantId, setFilterMerchantId] = useState('');
  const [counts, setCounts] = useState<Counts>({ ALLOW: 0, REVIEW: 0, BLOCK: 0 });

  // Queued events while paused
  const pausedQueueRef = useRef<DecisionEvent[]>([]);
  const socketRef = useRef<Socket | null>(null);

  const handleDecisionEvent = useCallback(
    (event: DecisionEvent) => {
      // Always increment counts
      setCounts((prev) => ({
        ...prev,
        [event.action]: prev[event.action] + 1,
      }));

      if (paused) {
        // Queue for when resumed
        pausedQueueRef.current.push(event);
        return;
      }

      // Add to displayed list, capped at MAX_EVENTS
      setEvents((prev) => {
        const updated = [event, ...prev];
        return updated.length > MAX_EVENTS ? updated.slice(0, MAX_EVENTS) : updated;
      });
    },
    [paused],
  );

  // Use a stable ref so socket callback always sees latest paused state
  const handleDecisionRef = useRef(handleDecisionEvent);
  useEffect(() => {
    handleDecisionRef.current = handleDecisionEvent;
  }, [handleDecisionEvent]);

  useEffect(() => {
    const socket = io(WS_URL, {
      auth: { token: getToken() },
      path: '/socket.io',
      transports: ['websocket'],
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on('decision', (event: DecisionEvent) => {
      handleDecisionRef.current(event);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handlePauseResume = () => {
    if (paused) {
      // Flush queued events into the list
      const queued = pausedQueueRef.current.splice(0);
      if (queued.length > 0) {
        setEvents((prev) => {
          const updated = [...queued.reverse(), ...prev];
          return updated.length > MAX_EVENTS ? updated.slice(0, MAX_EVENTS) : updated;
        });
      }
    }
    setPaused((p) => !p);
  };

  const filteredEvents = events.filter((e) => {
    if (filterAction !== 'ALL' && e.action !== filterAction) return false;
    if (filterMerchantId && !e.merchantId.toLowerCase().includes(filterMerchantId.toLowerCase()))
      return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-content mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Live Feed</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Real-time decision monitoring — decisions stream as they are made
        </p>
      </div>

      {/* Decision counters */}
      <DecisionCounter counts={counts} />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3" data-testid="filter-bar">
        <select
          className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value as FilterAction)}
          aria-label="Filter by action"
        >
          <option value="ALL">All actions</option>
          <option value="ALLOW">ALLOW</option>
          <option value="REVIEW">REVIEW</option>
          <option value="BLOCK">BLOCK</option>
        </select>

        <input
          className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          type="text"
          placeholder="Filter by merchant ID"
          value={filterMerchantId}
          onChange={(e) => setFilterMerchantId(e.target.value)}
          aria-label="Filter by merchant ID"
        />

        <button
          className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
            paused
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
          onClick={handlePauseResume}
          aria-label={paused ? 'Resume feed' : 'Pause feed'}
          data-testid="pause-resume-button"
        >
          {paused ? 'Resume' : 'Pause'}
        </button>

        {paused && (
          <span className="text-xs text-amber-600 font-medium" data-testid="paused-indicator">
            Feed paused
          </span>
        )}
      </div>

      {/* Event list */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        {/* Column headers */}
        <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <span className="w-20 shrink-0">Time</span>
          <span className="w-32 shrink-0">Entity ID</span>
          <span className="w-28 shrink-0">Merchant</span>
          <span className="w-20 shrink-0">Action</span>
          <span className="w-28 shrink-0">Risk Score</span>
          <span>Risk Factors</span>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400" data-testid="empty-state">
            {events.length === 0
              ? 'Waiting for decisions…'
              : 'No decisions match the current filters'}
          </div>
        ) : (
          <ul className="max-h-[600px] overflow-y-auto" data-testid="event-list">
            {filteredEvents.map((event) => (
              <EventRow key={event.decisionId} event={event} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
