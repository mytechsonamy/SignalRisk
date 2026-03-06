import { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useFraudTesterStore } from '../store/fraud-tester.store';
import { fraudTesterApi } from '../api/fraud-tester.api';
import type { BattleReport, BattleHistoryEntry, ScenarioResult } from '../types/fraud-tester.types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function detectionColor(rate: number): string {
  if (rate >= 0.9) return 'text-green-400';
  if (rate >= 0.7) return 'text-yellow-400';
  return 'text-red-400';
}

function detectionBg(rate: number): string {
  if (rate >= 0.9) return 'bg-green-500';
  if (rate >= 0.7) return 'bg-yellow-500';
  return 'bg-red-500';
}

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString('tr-TR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

// Build a BattleReport-like summary from a BattleHistoryEntry (store mock data)
function historyToReport(entry: BattleHistoryEntry): BattleReport {
  const { stats } = entry;
  // Generate mock scenario breakdown
  const MOCK_SCENARIOS: ScenarioResult[] = [
    {
      scenarioId: 'device-farm',
      scenarioName: 'Device Farm',
      totalEvents: 10,
      detectedCount: Math.round(stats.detectionRate * 10 + 1),
      detectionRate: Math.min(1, stats.detectionRate + 0.06),
      avgLatencyMs: stats.avgLatencyMs - 30,
      tp: 9, tn: 0, fp: 0,
      fn: 1,
      passed: stats.detectionRate + 0.06 >= 0.9,
    },
    {
      scenarioId: 'bot-checkout',
      scenarioName: 'Bot Checkout',
      totalEvents: 10,
      detectedCount: Math.round(stats.detectionRate * 10),
      detectionRate: stats.detectionRate,
      avgLatencyMs: stats.avgLatencyMs,
      tp: 8, tn: 0, fp: 0,
      fn: 2,
      passed: stats.detectionRate >= 0.8,
    },
    {
      scenarioId: 'velocity-evasion',
      scenarioName: 'Velocity Evasion',
      totalEvents: 10,
      detectedCount: Math.round(Math.max(0, stats.detectionRate - 0.15) * 10),
      detectionRate: Math.max(0, stats.detectionRate - 0.15),
      avgLatencyMs: stats.avgLatencyMs + 50,
      tp: 6, tn: 0, fp: 0,
      fn: 4,
      passed: Math.max(0, stats.detectionRate - 0.15) >= 0.7,
    },
    {
      scenarioId: 'emulator-spoof',
      scenarioName: 'Emulator Spoof',
      totalEvents: 10,
      detectedCount: Math.round(Math.min(1, stats.detectionRate + 0.04) * 10),
      detectionRate: Math.min(1, stats.detectionRate + 0.04),
      avgLatencyMs: stats.avgLatencyMs - 15,
      tp: 9, tn: 0, fp: 0,
      fn: 1,
      passed: Math.min(1, stats.detectionRate + 0.04) >= 0.85,
    },
    {
      scenarioId: 'sim-swap',
      scenarioName: 'SIM Swap',
      totalEvents: 10,
      detectedCount: Math.round(stats.detectionRate * 10 - 1),
      detectionRate: Math.max(0, stats.detectionRate - 0.05),
      avgLatencyMs: stats.avgLatencyMs + 20,
      tp: 7, tn: 0, fp: 0,
      fn: 3,
      passed: Math.max(0, stats.detectionRate - 0.05) >= 0.75,
    },
  ];

  return {
    id: entry.id,
    timestamp: entry.timestamp,
    targetAdapter: 'SignalRisk',
    scenarios: MOCK_SCENARIOS,
    overallTpr: stats.tpr,
    overallFpr: stats.fpr,
    avgLatencyMs: stats.avgLatencyMs,
  };
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-surface-sidebar p-4">
      <p className="text-[10px] uppercase tracking-widest text-text-secondary mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-text-primary">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function DetectionBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${detectionBg(rate)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`tabular-nums text-xs font-semibold w-10 text-right ${detectionColor(rate)}`}>
        {pct}%
      </span>
    </div>
  );
}

function ScenarioTable({ scenarios }: { scenarios: ScenarioResult[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border text-left">
            {['Scenario', 'Detection', 'Escaped (FN)', 'Avg Latency', 'Status'].map((h) => (
              <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-text-secondary whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {scenarios.map((s) => (
            <tr key={s.scenarioId} className="hover:bg-surface-sidebar/50 transition-colors">
              <td className="px-4 py-3 font-medium text-text-primary whitespace-nowrap">{s.scenarioName}</td>
              <td className="px-4 py-3 min-w-[160px]">
                <DetectionBar rate={s.detectionRate} />
              </td>
              <td className="px-4 py-3 tabular-nums text-text-secondary">
                {s.fn}/{s.totalEvents}
              </td>
              <td className="px-4 py-3 tabular-nums text-text-secondary whitespace-nowrap">
                {s.avgLatencyMs}ms
              </td>
              <td className="px-4 py-3">
                {s.passed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-semibold text-green-400">
                    PASS
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-900/40 px-2 py-0.5 text-xs font-semibold text-red-400">
                    FAIL
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComparisonChart({ reports }: { reports: BattleReport[] }) {
  const data = [...reports].slice(0, 5).reverse().map((r, idx) => ({
    name: `#${idx + 1}`,
    tpr: Math.round(r.overallTpr * 100),
    fpr: Math.round(r.overallFpr * 100),
    latency: r.avgLatencyMs,
  }));

  if (data.length < 2) {
    return (
      <p className="text-xs text-text-muted py-4 text-center">
        At least 2 battles needed for comparison.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <p className="text-xs text-text-secondary mb-2 font-medium">Detection Rate Trend (TPR)</p>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} unit="%" />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '6px', fontSize: 12 }}
              formatter={(v: number) => [`${v}%`]}
            />
            <Line type="monotone" dataKey="tpr" name="TPR" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="fpr" name="FPR" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="text-xs text-text-secondary mb-2 font-medium">Avg Latency per Battle (ms)</p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="ms" />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '6px', fontSize: 12 }}
              formatter={(v: number) => [`${v}ms`]}
            />
            <Bar dataKey="latency" name="Latency" fill="#6366f1" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function DetectionReportPage() {
  const { battleHistory } = useFraudTesterStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reports, setReports] = useState<BattleReport[]>([]);
  const [loading, setLoading] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fraudTesterApi.getBattles();
      setReports(data);
    } catch {
      // Fallback: convert store history to BattleReport shape
      setReports(battleHistory.map(historyToReport));
    } finally {
      setLoading(false);
    }
  }, [battleHistory]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const displayReports = reports.length > 0 ? reports : battleHistory.map(historyToReport);
  const selectedReport = displayReports.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="p-6 space-y-6 max-w-content mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Detection Reports</h1>
          <p className="mt-1 text-sm text-text-secondary">Battle-by-battle fraud detection analysis</p>
        </div>
        <button
          onClick={loadReports}
          disabled={loading}
          className="flex items-center gap-2 rounded-md border border-surface-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:border-primary transition-colors disabled:opacity-50"
        >
          <svg
            className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <div className="flex gap-6 items-start">
        {/* Left panel — battle list */}
        <div className="w-60 flex-shrink-0 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary px-1">Battles</p>
          <div className="rounded-lg bg-surface-card shadow-md overflow-hidden divide-y divide-surface-border">
            {displayReports.length === 0 && (
              <p className="px-4 py-6 text-xs text-text-muted text-center">No battles yet</p>
            )}
            {displayReports.map((report, idx) => (
              <button
                key={report.id}
                onClick={() => setSelectedId(report.id === selectedId ? null : report.id)}
                className={`w-full text-left px-4 py-3 transition-colors hover:bg-surface-sidebar ${
                  report.id === selectedId ? 'bg-surface-sidebar border-l-2 border-primary' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-semibold text-text-primary">
                    #{displayReports.length - idx}
                  </span>
                  <span className={`text-xs font-bold tabular-nums ${detectionColor(report.overallTpr)}`}>
                    {Math.round(report.overallTpr * 100)}%
                  </span>
                </div>
                <p className="text-[10px] text-text-muted truncate">
                  {formatDate(report.timestamp)}
                </p>
                <p className="text-[10px] text-text-secondary mt-0.5">
                  {report.scenarios.length} scenarios
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel — selected battle detail */}
        <div className="flex-1 min-w-0 space-y-4">
          {!selectedReport ? (
            <div className="rounded-lg bg-surface-card shadow-md p-12 text-center">
              <p className="text-text-muted text-sm">Select a battle to view detailed results</p>
            </div>
          ) : (
            <>
              {/* KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  label="TPR"
                  value={`${Math.round(selectedReport.overallTpr * 100)}%`}
                  sub="True Positive Rate"
                />
                <StatCard
                  label="FPR"
                  value={`${(selectedReport.overallFpr * 100).toFixed(1)}%`}
                  sub="False Positive Rate"
                />
                <StatCard
                  label="Avg Latency"
                  value={`${selectedReport.avgLatencyMs}ms`}
                  sub="Per decision"
                />
                <StatCard
                  label="Scenarios Run"
                  value={`${selectedReport.scenarios.filter((s) => s.passed).length}/${selectedReport.scenarios.length}`}
                  sub="Passed"
                />
              </div>

              {/* Scenario detail table */}
              <div className="rounded-lg bg-surface-card shadow-md overflow-hidden">
                <div className="px-5 py-3 border-b border-surface-border">
                  <h2 className="text-sm font-semibold text-text-primary">Scenario Breakdown</h2>
                </div>
                <ScenarioTable scenarios={selectedReport.scenarios} />
              </div>

              {/* Comparison chart */}
              <div className="rounded-lg bg-surface-card shadow-md p-5">
                <h2 className="text-sm font-semibold text-text-primary mb-4">
                  Trend — Last {Math.min(5, displayReports.length)} Battles
                </h2>
                <ComparisonChart reports={displayReports} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
