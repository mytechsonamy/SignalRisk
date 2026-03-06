import { useState } from 'react';
import { useFraudTesterStore } from '../store/fraud-tester.store';
import type { AgentSettings, AgentConfig } from '../types/fraud-tester.types';

// ─── agent metadata ───────────────────────────────────────────────────────────

interface AgentMeta {
  key: keyof AgentConfig;
  name: string;
  description: string;
  icon: React.ReactNode;
}

function IconGrid() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function IconChaos() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

const AGENT_META: AgentMeta[] = [
  {
    key: 'fraudSim',
    name: 'Fraud Simulation',
    description: 'Simulates known fraud patterns including device farms, emulator spoofing, and bot checkout flows.',
    icon: <IconGrid />,
  },
  {
    key: 'adversarial',
    name: 'Adversarial Agent',
    description: 'Uses adaptive evasion techniques to test the robustness of fraud detection under adversarial conditions.',
    icon: <IconBolt />,
  },
  {
    key: 'chaos',
    name: 'Chaos Agent',
    description: 'Injects random noise and edge-case scenarios to stress-test detection resilience.',
    icon: <IconChaos />,
  },
];

const SCHEDULES = [
  { value: 'manual', label: 'Manual' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
] as const;

const ATTACK_PATTERNS = [
  { value: 'all', label: 'All Patterns' },
  { value: 'emulator-bypass', label: 'Emulator Bypass' },
  { value: 'slow-fraud', label: 'Slow Fraud' },
  { value: 'bot-evasion', label: 'Bot Evasion' },
] as const;

const CHAOS_MODES = [
  { value: 'all', label: 'All Modes' },
  { value: 'timeout', label: 'Timeout Injection' },
  { value: 'partialFailure', label: 'Partial Failure' },
  { value: 'stress', label: 'Stress Test' },
] as const;

// ─── sub-components ───────────────────────────────────────────────────────────

function AdversarialParams({
  settings,
  onChange,
  disabled,
}: {
  settings: AgentSettings;
  onChange: (patch: Partial<AgentSettings>) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3 pt-1 border-t border-surface-border">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Adversarial Parameters</p>

      <div className="space-y-1.5">
        <label className="block text-xs text-text-secondary">Attack Pattern</label>
        <select
          value={settings.attackPattern ?? 'all'}
          onChange={(e) => onChange({ attackPattern: e.target.value as AgentSettings['attackPattern'] })}
          disabled={disabled}
          className="w-full rounded-md border border-surface-border bg-surface-sidebar text-text-primary text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
        >
          {ATTACK_PATTERNS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <label className="text-text-secondary">Intensity</label>
          <span className="tabular-nums font-semibold text-text-primary">{settings.intensity}/10</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={settings.intensity}
          onChange={(e) => onChange({ intensity: parseInt(e.target.value, 10) })}
          disabled={disabled}
          className="w-full accent-primary disabled:opacity-40"
        />
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>Low</span>
          <span>Medium</span>
          <span>High</span>
        </div>
      </div>
    </div>
  );
}

function ChaosParams({
  settings,
  onChange,
  disabled,
}: {
  settings: AgentSettings;
  onChange: (patch: Partial<AgentSettings>) => void;
  disabled: boolean;
}) {
  const chaosMode = settings.chaosMode ?? 'all';
  const isPartialFailure = chaosMode === 'partialFailure';
  const isTimeout = chaosMode === 'timeout';

  return (
    <div className="space-y-3 pt-1 border-t border-surface-border">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Chaos Parameters</p>

      <div className="space-y-1.5">
        <label className="block text-xs text-text-secondary">Chaos Mode</label>
        <select
          value={chaosMode}
          onChange={(e) => onChange({ chaosMode: e.target.value as AgentSettings['chaosMode'] })}
          disabled={disabled}
          className="w-full rounded-md border border-surface-border bg-surface-sidebar text-text-primary text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
        >
          {CHAOS_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className={`space-y-2 ${!isPartialFailure ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between text-xs">
          <label className="text-text-secondary">Failure Rate</label>
          <span className="tabular-nums font-semibold text-text-primary">
            {Math.round((settings.failureRate ?? 0.3) * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={50}
          step={1}
          value={Math.round((settings.failureRate ?? 0.3) * 100)}
          onChange={(e) => onChange({ failureRate: parseInt(e.target.value, 10) / 100 })}
          disabled={disabled || !isPartialFailure}
          className="w-full accent-primary disabled:opacity-40"
        />
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
        </div>
      </div>

      <div className={`space-y-1.5 ${!isTimeout ? 'opacity-40 pointer-events-none' : ''}`}>
        <label className="block text-xs text-text-secondary">Timeout (ms)</label>
        <input
          type="number"
          min={100}
          max={30000}
          step={100}
          value={settings.timeoutMs ?? 5000}
          onChange={(e) => onChange({ timeoutMs: parseInt(e.target.value, 10) || 5000 })}
          disabled={disabled || !isTimeout}
          className="w-full rounded-md border border-surface-border bg-surface-sidebar text-text-primary text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
        />
      </div>
    </div>
  );
}

function AgentCard({
  meta,
  settings,
  onChange,
}: {
  meta: AgentMeta;
  settings: AgentSettings;
  onChange: (patch: Partial<AgentSettings>) => void;
}) {
  const isActive = settings.enabled;

  return (
    <div className="rounded-lg bg-surface-card shadow-md p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
              isActive ? 'bg-primary/20 text-primary' : 'bg-surface-border text-text-muted'
            }`}
          >
            {meta.icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary truncate">{meta.name}</h3>
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{meta.description}</p>
          </div>
        </div>

        {/* Enable toggle */}
        <button
          onClick={() => onChange({ enabled: !settings.enabled })}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
            settings.enabled ? 'bg-primary' : 'bg-surface-border'
          }`}
          role="switch"
          aria-checked={settings.enabled}
          aria-label={`Toggle ${meta.name}`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              settings.enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Schedule */}
      <div className="space-y-1.5">
        <label htmlFor={`schedule-${meta.key}`} className="block text-xs text-text-secondary">
          Schedule
        </label>
        <select
          id={`schedule-${meta.key}`}
          value={settings.schedule}
          onChange={(e) => onChange({ schedule: e.target.value as AgentSettings['schedule'] })}
          disabled={!settings.enabled}
          className="w-full rounded-md border border-surface-border bg-surface-sidebar text-text-primary text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
        >
          {SCHEDULES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Agent-specific params */}
      {meta.key === 'fraudSim' && (
        <div className="space-y-2 pt-1 border-t border-surface-border">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor={`intensity-${meta.key}`} className="text-text-secondary">
              Intensity
            </label>
            <span className="tabular-nums font-semibold text-text-primary">{settings.intensity}/10</span>
          </div>
          <input
            id={`intensity-${meta.key}`}
            type="range"
            min={1}
            max={10}
            step={1}
            value={settings.intensity}
            onChange={(e) => onChange({ intensity: parseInt(e.target.value, 10) })}
            disabled={!settings.enabled}
            className="w-full accent-primary disabled:opacity-40"
          />
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
          </div>
        </div>
      )}

      {meta.key === 'adversarial' && (
        <AdversarialParams settings={settings} onChange={onChange} disabled={!settings.enabled} />
      )}

      {meta.key === 'chaos' && (
        <ChaosParams settings={settings} onChange={onChange} disabled={!settings.enabled} />
      )}

      {/* Status chip */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${
            isActive ? 'bg-green-500 animate-pulse' : 'bg-surface-border'
          }`}
        />
        <span className="text-xs text-text-muted">
          {isActive ? 'Ready' : 'Inactive'}
        </span>
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function AgentConfigPage() {
  const { agentConfig, updateAgentConfig } = useFraudTesterStore();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    try {
      localStorage.setItem('signalrisk:agentConfig', JSON.stringify(agentConfig));
    } catch {
      // localStorage may be unavailable
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 space-y-6 max-w-content mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Agent Configuration</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Configure fraud simulation agents for Battle Arena
          </p>
        </div>
        <button
          onClick={handleSave}
          className={`flex-shrink-0 flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            saved
              ? 'bg-green-600 text-white'
              : 'bg-primary hover:bg-primary-hover text-white'
          }`}
        >
          {saved ? (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </>
          ) : (
            'Save Configuration'
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {AGENT_META.map((meta) => (
          <AgentCard
            key={meta.key}
            meta={meta}
            settings={agentConfig[meta.key]}
            onChange={(patch) =>
              updateAgentConfig({
                [meta.key]: { ...agentConfig[meta.key], ...patch },
              })
            }
          />
        ))}
      </div>

      <p className="text-xs text-text-muted">
        All agents are active. Configure parameters per-agent above and save to persist settings.
      </p>
    </div>
  );
}
