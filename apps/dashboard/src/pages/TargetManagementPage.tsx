import { useState } from 'react';
import { fraudTesterApi } from '../api/fraud-tester.api';

type ConnectionStatus = 'idle' | 'checking' | 'connected' | 'error';

export default function TargetManagementPage() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const testConnection = async () => {
    setConnectionStatus('checking');
    setLatencyMs(null);
    const start = Date.now();
    try {
      await fraudTesterApi.healthCheck();
      const elapsed = Date.now() - start;
      setLatencyMs(elapsed);
      setConnectionStatus('connected');
    } catch {
      setConnectionStatus('error');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-content mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Target Management</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage fraud detection targets for Battle Arena
          </p>
        </div>
      </div>

      {/* ── Section 1: Default Target ─────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3 px-1">
          Active Targets
        </h2>
        <div className="rounded-lg bg-surface-card shadow-md p-5 space-y-4 border border-primary/30 max-w-lg">
          {/* Title row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                <svg
                  className="h-5 w-5 text-primary"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path
                    strokeLinecap="round" strokeLinejoin="round"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">SignalRisk (Default)</p>
                <p className="text-xs text-text-secondary">localhost:3002</p>
              </div>
            </div>

            {/* Connection badge */}
            {connectionStatus === 'idle' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-semibold text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Connected
              </span>
            )}
            {connectionStatus === 'checking' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-900/40 px-2 py-0.5 text-xs font-semibold text-yellow-400">
                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Checking…
              </span>
            )}
            {connectionStatus === 'connected' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-semibold text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Connected{latencyMs !== null ? ` — ${latencyMs}ms` : ''}
              </span>
            )}
            {connectionStatus === 'error' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-900/40 px-2 py-0.5 text-xs font-semibold text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                Connection failed
              </span>
            )}
          </div>

          {/* Details */}
          <div className="rounded-md bg-surface-sidebar p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">Base URL</span>
              <span className="text-text-primary font-medium font-mono">
                http://localhost:3002
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">API Key</span>
              <span className="text-text-primary font-medium font-mono tracking-widest">
                sk_test_••••••••
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">Environment</span>
              <span className="text-text-primary font-medium">Development</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">Auth</span>
              <span className="text-text-primary font-medium">API Key</span>
            </div>
          </div>

          {/* Test connection button */}
          <button
            onClick={testConnection}
            disabled={connectionStatus === 'checking'}
            className="w-full rounded-md border border-primary/40 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connectionStatus === 'checking' ? 'Testing…' : 'Test Connection'}
          </button>
        </div>
      </div>

      {/* ── Section 2: Add Custom Target (Sprint 19) ───────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3 px-1">
          Add Custom Target
          <span className="ml-2 normal-case text-[10px] rounded-full bg-surface-border px-2 py-0.5 font-semibold text-text-muted">
            Sprint 19
          </span>
        </h2>
        <div className="rounded-lg bg-surface-card shadow-md p-5 space-y-4 opacity-50 max-w-lg">
          <p className="text-xs text-text-secondary">
            Connect any HTTP-compatible fraud detection system as a battle target.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="block text-xs text-text-secondary">Base URL</label>
              <input
                type="url"
                disabled
                placeholder="https://your-service.example.com"
                className="w-full rounded-md border border-surface-border bg-surface-sidebar text-text-primary text-sm px-3 py-2 cursor-not-allowed opacity-60 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-text-secondary">API Key</label>
              <input
                type="password"
                disabled
                placeholder="sk_test_••••••••••••••••"
                className="w-full rounded-md border border-surface-border bg-surface-sidebar text-text-primary text-sm px-3 py-2 cursor-not-allowed opacity-60 focus:outline-none"
              />
            </div>
            <button
              disabled
              className="w-full rounded-md bg-surface-border px-4 py-2 text-sm font-medium text-text-muted cursor-not-allowed"
              title="Available in Sprint 19"
            >
              Test & Add Target
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
