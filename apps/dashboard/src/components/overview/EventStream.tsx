import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useDashboardStore, type DecisionEvent } from '../../store/dashboard.store';
import Badge from '../ui/Badge';

function truncateEntityId(id: string, maxLen = 16): string {
  if (id.length <= maxLen) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

const WS_URL = (import.meta as { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL ?? 'http://localhost:3000';

export default function EventStream() {
  const { events, prependEvent } = useDashboardStore();
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
    'disconnected',
  );
  const socketRef = useRef<Socket | null>(null);

  const connect = () => {
    if (socketRef.current?.connected) return;

    setWsStatus('connecting');
    const socket = io(WS_URL, { path: '/socket.io', transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => setWsStatus('connected'));

    socket.on('decision', (data: DecisionEvent) => {
      prependEvent(data);
    });

    socket.on('disconnect', () => setWsStatus('disconnected'));
    socket.on('connect_error', () => setWsStatus('disconnected'));
  };

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = () => {
    socketRef.current?.disconnect();
    connect();
  };

  return (
    <div className="rounded-lg bg-surface-card shadow-md flex flex-col h-full" role="region" aria-label="Live event stream">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Live Event Stream</h2>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              wsStatus === 'connected'
                ? 'bg-decision-allow'
                : wsStatus === 'connecting'
                  ? 'bg-risk-medium animate-pulse'
                  : 'bg-decision-block'
            }`}
            aria-label={`WebSocket: ${wsStatus}`}
          />
          <span className="text-xs text-text-muted capitalize">{wsStatus}</span>
        </div>
      </div>

      {wsStatus === 'disconnected' && events.length === 0 && (
        <div className="flex flex-col items-center justify-center p-6 text-center gap-3">
          <p className="text-sm text-text-secondary">Live feed disconnected</p>
          <button
            onClick={handleRetry}
            className="rounded-md bg-brand-primary px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-brand-primary-hover transition-colors duration-fast"
          >
            Retry connection
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {events.length === 0 && wsStatus !== 'disconnected' ? (
          <div className="flex items-center justify-center p-6">
            <p className="text-sm text-text-muted">Waiting for events...</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-card border-b border-surface-border">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-text-muted">Time</th>
                <th className="px-4 py-2 text-left font-medium text-text-muted">Entity ID</th>
                <th className="px-4 py-2 text-left font-medium text-text-muted">Decision</th>
                <th className="px-4 py-2 text-right font-medium text-text-muted">Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-surface-hover transition-colors duration-fast">
                  <td className="px-4 py-2 text-text-muted font-mono tabular-nums">
                    {formatTimestamp(event.timestamp)}
                  </td>
                  <td className="px-4 py-2 text-text-secondary font-mono">
                    {truncateEntityId(event.entityId)}
                  </td>
                  <td className="px-4 py-2">
                    <Badge action={event.action} />
                  </td>
                  <td className="px-4 py-2 text-right text-text-muted tabular-nums">
                    {event.latencyMs}ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
