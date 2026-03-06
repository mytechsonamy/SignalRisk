import { RadialBarChart, RadialBar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useFraudTesterStore } from '../store/fraud-tester.store';
import type { AttackResult, AttackDecision } from '../types/fraud-tester.types';

const DEMO_SCENARIOS = ['Device Farm', 'Emulator Spoof', 'Bot Checkout', 'Velocity Evasion', 'SIM Swap'];

function decisionBadge(decision: AttackDecision) {
  if (decision === 'BLOCKED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-900/40 px-2 py-0.5 text-xs font-semibold text-red-400">
        BLOCKED
      </span>
    );
  }
  if (decision === 'DETECTED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-900/40 px-2 py-0.5 text-xs font-semibold text-orange-400">
        DETECTED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-900/40 px-2 py-0.5 text-xs font-semibold text-yellow-400">
      MISSED
    </span>
  );
}

function AttackTeamPanel() {
  const { battleStatus } = useFraudTesterStore();
  const isRunning = battleStatus === 'running';

  return (
    <div className="flex w-48 flex-shrink-0 flex-col gap-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-secondary">
          Attack Team
        </p>
        <div className="rounded-lg bg-surface-card shadow-md divide-y divide-surface-border">
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
              <span className="text-xs text-text-primary">Fraud Sim</span>
            </div>
            {isRunning ? (
              <span className="rounded-full bg-green-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-green-400">Active</span>
            ) : (
              <span className="rounded-full bg-yellow-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400">Idle</span>
            )}
          </div>
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-xs text-text-primary">Adversar.</span>
            </div>
            <span className="rounded-full bg-yellow-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400">Idle</span>
          </div>
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs text-text-primary">Velocity</span>
            </div>
            <span className="rounded-full bg-yellow-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400">Idle</span>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-secondary">Waiting</p>
        <div className="rounded-lg bg-surface-card shadow-md divide-y divide-surface-border">
          <div className="px-3 py-2.5 text-xs text-text-secondary">SIM Swap</div>
          <div className="px-3 py-2.5 text-xs text-text-secondary">Bot Checkout</div>
        </div>
      </div>
    </div>
  );
}

function DetectionGauge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const data = [{ name: 'Detection', value: pct, fill: pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444' }];

  return (
    <ResponsiveContainer width="100%" height={160}>
      <RadialBarChart
        innerRadius="60%"
        outerRadius="90%"
        data={data}
        startAngle={200}
        endAngle={-20}
        barSize={16}
      >
        <RadialBar dataKey="value" background={{ fill: '#1e293b' }} cornerRadius={8} />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

function LiveFeedRow({ result }: { result: AttackResult }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-surface-border last:border-0">
      {decisionBadge(result.decision)}
      <span className="flex-1 truncate text-xs text-text-primary">{result.scenarioName}</span>
      <span className="text-xs tabular-nums text-text-secondary">{(result.riskScore * 100).toFixed(0)}</span>
      <span className="text-xs tabular-nums text-text-muted">{result.latencyMs}ms</span>
    </div>
  );
}

function CenterPanel() {
  const { stats, liveFeed, battleHistory, battleStatus } = useFraudTesterStore();
  const pct = Math.round(stats.detectionRate * 100);
  const recentFeed = liveFeed.slice(0, 20);

  const trendData = [...battleHistory].slice(0, 5).reverse().map((entry, idx) => ({
    name: `#${idx + 1}`,
    rate: Math.round(entry.stats.detectionRate * 100),
  }));

  return (
    <div className="flex flex-1 flex-col gap-4 min-w-0">
      <div className="rounded-lg bg-surface-card shadow-md p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-2">Detection Score</p>
        <div className="relative">
          <DetectionGauge value={stats.detectionRate} />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-4xl font-bold tabular-nums text-text-primary">{pct}%</span>
            <span className="text-xs text-text-secondary mt-1">
              {battleStatus === 'running' ? 'Live' : battleStatus === 'completed' ? 'Completed' : 'Idle'}
            </span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] text-text-secondary uppercase tracking-wide">TPR</p>
            <p className="text-sm font-semibold tabular-nums text-text-primary">{(stats.tpr * 100).toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-[10px] text-text-secondary uppercase tracking-wide">FPR</p>
            <p className="text-sm font-semibold tabular-nums text-text-primary">{(stats.fpr * 100).toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-[10px] text-text-secondary uppercase tracking-wide">Avg Latency</p>
            <p className="text-sm font-semibold tabular-nums text-text-primary">{stats.avgLatencyMs}ms</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-surface-card shadow-md p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-2">
          Live Feed
          {stats.totalAttacks > 0 && (
            <span className="ml-2 font-normal normal-case text-text-muted">
              {stats.totalAttacks} attacks
            </span>
          )}
        </p>
        <div className="overflow-y-auto max-h-64">
          {recentFeed.length === 0 ? (
            <p className="py-4 text-center text-xs text-text-muted">Start a battle to see live results</p>
          ) : (
            recentFeed.map((r) => <LiveFeedRow key={r.id} result={r} />)
          )}
        </div>
      </div>

      {trendData.length > 0 && (
        <div className="rounded-lg bg-surface-card shadow-md p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-3">Detection Trend</p>
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={trendData}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} unit="%" />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '6px', fontSize: 12 }}
                formatter={(v: number) => [`${v}%`, 'Detection Rate']}
              />
              <Line type="monotone" dataKey="rate" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ConfigPanel() {
  const { config, battleStatus, startBattle, stopBattle, updateConfig } = useFraudTesterStore();
  const isRunning = battleStatus === 'running';

  const toggleScenario = (name: string) => {
    const enabled = config.enabledScenarios.includes(name)
      ? config.enabledScenarios.filter((s) => s !== name)
      : [...config.enabledScenarios, name];
    updateConfig({ enabledScenarios: enabled });
  };

  return (
    <div className="flex w-56 flex-shrink-0 flex-col gap-4">
      <div className="rounded-lg bg-surface-card shadow-md p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">Configuration</p>

        <div>
          <label className="block text-xs text-text-secondary mb-1">Target</label>
          <p className="text-sm font-medium text-text-primary">{config.targetName}</p>
        </div>

        <div>
          <label htmlFor="ft-duration" className="block text-xs text-text-secondary mb-1">Duration</label>
          <select
            id="ft-duration"
            value={config.duration}
            onChange={(e) => updateConfig({ duration: e.target.value as typeof config.duration })}
            disabled={isRunning}
            className="w-full rounded-md border border-surface-border bg-surface-sidebar text-text-primary text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          >
            <option value="1min">1 minute</option>
            <option value="5min">5 minutes</option>
            <option value="10min">10 minutes</option>
            <option value="30min">30 minutes</option>
          </select>
        </div>

        <div>
          <label htmlFor="ft-intensity" className="block text-xs text-text-secondary mb-1">Intensity</label>
          <select
            id="ft-intensity"
            value={config.intensity}
            onChange={(e) => updateConfig({ intensity: e.target.value as typeof config.intensity })}
            disabled={isRunning}
            className="w-full rounded-md border border-surface-border bg-surface-sidebar text-text-primary text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div>
          <p className="text-xs text-text-secondary mb-2">Scenarios</p>
          <div className="space-y-2">
            {DEMO_SCENARIOS.map((name) => (
              <label key={name} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enabledScenarios.includes(name)}
                  onChange={() => toggleScenario(name)}
                  disabled={isRunning}
                  className="rounded border-surface-border accent-primary disabled:opacity-50"
                />
                <span className="text-xs text-text-primary">{name}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={isRunning ? stopBattle : startBattle}
          className={`w-full rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            isRunning
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-primary hover:bg-primary-hover text-white'
          }`}
        >
          {isRunning ? 'Stop' : 'Start Battle'}
        </button>
      </div>
    </div>
  );
}

export default function BattleArenaPage() {
  const { battleStatus, startBattle, stopBattle } = useFraudTesterStore();
  const isRunning = battleStatus === 'running';

  return (
    <div className="p-6 space-y-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Battle Arena</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Real-time adversarial testing against fraud detection
          </p>
        </div>
        <button
          onClick={isRunning ? stopBattle : startBattle}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            isRunning
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-primary hover:bg-primary-hover text-white'
          }`}
        >
          {isRunning ? (
            <>
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
              Stop
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              Start Battle
            </>
          )}
        </button>
      </div>

      <div className="flex gap-4 items-start">
        <AttackTeamPanel />
        <CenterPanel />
        <ConfigPanel />
      </div>
    </div>
  );
}
