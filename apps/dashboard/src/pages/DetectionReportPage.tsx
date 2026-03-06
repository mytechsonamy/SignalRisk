import { useState } from 'react';

interface BattleReport {
  id: string;
  date: string;
  detectionRate: number;
  scenarioCount: number;
  totalAttacks: number;
}

const MOCK_REPORTS: BattleReport[] = [
  { id: 'rpt-001', date: '2026-03-07 14:32', detectionRate: 0.88, scenarioCount: 5, totalAttacks: 50 },
  { id: 'rpt-002', date: '2026-03-07 10:15', detectionRate: 0.82, scenarioCount: 4, totalAttacks: 40 },
  { id: 'rpt-003', date: '2026-03-06 16:45', detectionRate: 0.76, scenarioCount: 5, totalAttacks: 60 },
  { id: 'rpt-004', date: '2026-03-06 09:00', detectionRate: 0.91, scenarioCount: 3, totalAttacks: 30 },
  { id: 'rpt-005', date: '2026-03-05 17:22', detectionRate: 0.84, scenarioCount: 5, totalAttacks: 45 },
];

function detectionColor(rate: number): string {
  if (rate >= 0.9) return 'text-green-400';
  if (rate >= 0.7) return 'text-yellow-400';
  return 'text-red-400';
}

export default function DetectionReportPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = MOCK_REPORTS.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="p-6 space-y-6 max-w-content mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Detection Reports</h1>
        <p className="mt-1 text-sm text-text-secondary">Son 5 battle raporu</p>
      </div>

      <div className="rounded-lg bg-surface-card shadow-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-text-secondary">ID</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-text-secondary">Tarih</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-text-secondary">Detection Rate</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-text-secondary">Senaryolar</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-text-secondary">Toplam Saldırı</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {MOCK_REPORTS.map((report) => (
              <tr
                key={report.id}
                onClick={() => setSelectedId(report.id === selectedId ? null : report.id)}
                className={`cursor-pointer transition-colors hover:bg-surface-sidebar ${
                  report.id === selectedId ? 'bg-surface-sidebar' : ''
                }`}
              >
                <td className="px-5 py-3 font-mono text-xs text-text-muted">{report.id}</td>
                <td className="px-5 py-3 text-text-secondary">{report.date}</td>
                <td className={`px-5 py-3 font-semibold tabular-nums ${detectionColor(report.detectionRate)}`}>
                  {Math.round(report.detectionRate * 100)}%
                </td>
                <td className="px-5 py-3 text-text-primary">{report.scenarioCount}</td>
                <td className="px-5 py-3 text-text-primary tabular-nums">{report.totalAttacks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="rounded-lg bg-surface-card shadow-md p-5 space-y-3 border border-primary/30">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Battle Detail: {selected.id}</h2>
            <button
              onClick={() => setSelectedId(null)}
              className="text-text-muted hover:text-text-primary transition-colors"
              aria-label="Close detail panel"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-text-secondary">
            Detailed battle report data will be available in a future sprint.
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-md bg-surface-sidebar p-3">
              <p className="text-[10px] text-text-secondary uppercase tracking-wide">Detection Rate</p>
              <p className={`text-lg font-bold tabular-nums ${detectionColor(selected.detectionRate)}`}>
                {Math.round(selected.detectionRate * 100)}%
              </p>
            </div>
            <div className="rounded-md bg-surface-sidebar p-3">
              <p className="text-[10px] text-text-secondary uppercase tracking-wide">Scenarios</p>
              <p className="text-lg font-bold text-text-primary tabular-nums">{selected.scenarioCount}</p>
            </div>
            <div className="rounded-md bg-surface-sidebar p-3">
              <p className="text-[10px] text-text-secondary uppercase tracking-wide">Attacks</p>
              <p className="text-lg font-bold text-text-primary tabular-nums">{selected.totalAttacks}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
