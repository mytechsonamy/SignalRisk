import { useState } from 'react';

interface AgentConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  intensity: number;
  supportsIntensity: boolean;
  available: boolean;
}

const INITIAL_AGENTS: AgentConfig[] = [
  {
    id: 'fraud-sim',
    name: 'Fraud Simulation',
    description: 'Simulates known fraud patterns including device farms, emulator spoofing, and bot checkout flows.',
    enabled: true,
    intensity: 50,
    supportsIntensity: true,
    available: true,
  },
  {
    id: 'adversarial',
    name: 'Adversarial Agent',
    description: 'Uses adaptive evasion techniques to test the robustness of fraud detection under adversarial conditions.',
    enabled: false,
    intensity: 50,
    supportsIntensity: false,
    available: false,
  },
  {
    id: 'chaos',
    name: 'Chaos Agent',
    description: 'Injects random noise and edge-case scenarios to stress-test detection resilience.',
    enabled: false,
    intensity: 50,
    supportsIntensity: false,
    available: false,
  },
];

function intensityLabel(value: number): string {
  if (value < 34) return 'Low';
  if (value < 67) return 'Medium';
  return 'High';
}

export default function AgentConfigPage() {
  const [agents, setAgents] = useState(INITIAL_AGENTS);

  const toggleAgent = (id: string) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === id && a.available ? { ...a, enabled: !a.enabled } : a))
    );
  };

  const setIntensity = (id: string, value: number) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, intensity: value } : a)));
  };

  return (
    <div className="p-6 space-y-6 max-w-content mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Agent Configuration</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Configure fraud simulation agents for Battle Arena
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={`rounded-lg bg-surface-card shadow-md p-5 space-y-4 ${
              !agent.available ? 'opacity-60' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-text-primary">{agent.name}</h3>
                  {!agent.available && (
                    <span className="rounded-full bg-surface-border px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                      Sprint 18
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-secondary">{agent.description}</p>
              </div>

              <button
                onClick={() => toggleAgent(agent.id)}
                disabled={!agent.available}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed ${
                  agent.enabled ? 'bg-primary' : 'bg-surface-border'
                }`}
                role="switch"
                aria-checked={agent.enabled}
                aria-label={`Toggle ${agent.name}`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    agent.enabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {agent.supportsIntensity && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={`intensity-${agent.id}`} className="text-text-secondary">
                    Intensity
                  </label>
                  <span className="font-semibold text-text-primary">{intensityLabel(agent.intensity)}</span>
                </div>
                <input
                  id={`intensity-${agent.id}`}
                  type="range"
                  min={0}
                  max={100}
                  value={agent.intensity}
                  onChange={(e) => setIntensity(agent.id, parseInt(e.target.value, 10))}
                  disabled={!agent.enabled}
                  className="w-full accent-primary disabled:opacity-50"
                />
                <div className="flex justify-between text-[10px] text-text-muted">
                  <span>Low</span>
                  <span>Medium</span>
                  <span>High</span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  agent.available && agent.enabled ? 'bg-green-500' : 'bg-surface-border'
                }`}
              />
              <span className="text-xs text-text-muted">
                {!agent.available ? 'Unavailable' : agent.enabled ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
