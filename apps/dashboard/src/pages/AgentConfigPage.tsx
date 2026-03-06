import { useState } from 'react';
import { useFraudTesterStore } from '../store/fraud-tester.store';
import type { AgentSettings, AgentConfig } from '../types/fraud-tester.types';

// ─── agent metadata ───────────────────────────────────────────────────────────

interface AgentMeta {
  key: keyof AgentConfig;
  name: string;
  description: string;
  available: boolean;
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
    available: true,
    icon: <IconGrid />,
  },
  {
    key: 'adversarial',
    name: 'Adversarial Agent',
    description: 'Uses adaptive evasion techniques to test the robustness of fraud detection under adversarial conditions.',
    available: false,
    icon: <IconBolt />,
  },
  {
    key: 'chaos',
    name: 'Chaos Agent',
    description: 'Injects random noise and edge-case scenarios to stress-test detection resilience.',
    available: false,
    icon: <IconChaos />,
  },
];

const SCHEDULES = [
  { value: 'manual', label: 'Manual' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
] as const;

// ─── sub-components ───────────────────────────────────────────────────────────

function AgentCard({
  meta,
  settings,
  onChange,
}: {
  meta: AgentMeta;
  settings: AgentSettings;
  onChange: (patch: Partial<AgentSettings>) => void;
}) {
  const isActive = meta.available && settings.enabled;

  return (
    <div
      className={`rounded-lg bg-surface-card shadow-md p-5 space-y-5 ${
        !meta.available ? 'opacity-60' : ''
      }`}
    >
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
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-text-primary truncate">{meta.name}</h3>
              {!meta.available && (
                <span className="flex-shrink-0 rounded-full bg-surface-border px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                  Sprint 19
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{meta.description}</p>
          </div>
        </div>

        {/* Enable toggle */}
        <button
          onClick={() => meta.available && onChange({ enabled: !settings.enabled })}
          disabled={!meta.available}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed ${
            settings.enabled && meta.available ? 'bg-primary' : 'bg-surface-border'
          }`}
          role="switch"
          aria-checked={settings.enabled && meta.available}
          aria-label={`Toggle ${meta.name}`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              settings.enabled && meta.available ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Intensity slider */}
      <div className="space-y-2">
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
          disabled={!meta.available || !settings.enabled}
          className="w-full accent-primary disabled:opacity-40"
        />
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>Low</span>
          <span>Medium</span>
          <span>High</span>
        </div>
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
          disabled={!meta.available || !settings.enabled}
          className="w-full rounded-md border border-surface-border bg-surface-sidebar text-text-primary text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
        >
          {SCHEDULES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Status chip */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${
            isActive ? 'bg-green-500 animate-pulse' : 'bg-surface-border'
          }`}
        />
        <span className="text-xs text-text-muted">
          {!meta.available ? 'Sprint 19' : isActive ? 'Ready' : 'Inactive'}
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
        Adversarial and Chaos agents are planned for Sprint 19. Only Fraud Simulation is active in this sprint.
      </p>
    </div>
  );
}
