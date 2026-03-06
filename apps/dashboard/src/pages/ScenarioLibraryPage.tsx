import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

type ScenarioCategory = 'device' | 'velocity' | 'identity' | 'bot' | 'network';
type ExpectedDecision = 'BLOCK' | 'REVIEW';

interface Scenario {
  id: string;
  name: string;
  category: ScenarioCategory;
  description: string;
  lastRunAgo: string;
  detectionRate: number;
  totalRuns: number;
  expectedDecision: ExpectedDecision;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'device-farm',
    name: 'Device Farm',
    category: 'device',
    description: '100 account aynı fingerprint — risk > 0.8, BLOCK bekleniyor',
    lastRunAgo: '2 saat önce',
    detectionRate: 0.94,
    totalRuns: 12,
    expectedDecision: 'BLOCK',
  },
  {
    id: 'velocity-evasion',
    name: 'Velocity Evasion',
    category: 'velocity',
    description: '12 saate yayılmış transaction — behavioral detection bekleniyor',
    lastRunAgo: '1 gün önce',
    detectionRate: 0.67,
    totalRuns: 8,
    expectedDecision: 'REVIEW',
  },
  {
    id: 'emulator-spoof',
    name: 'Emulator Spoof',
    category: 'device',
    description: 'Sahte GPU/sensor sinyalleri — emulator detection bekleniyor',
    lastRunAgo: '3 saat önce',
    detectionRate: 0.98,
    totalRuns: 15,
    expectedDecision: 'BLOCK',
  },
  {
    id: 'bot-checkout',
    name: 'Bot Checkout',
    category: 'bot',
    description: 'Hızlı ardışık checkout — bot detection bekleniyor',
    lastRunAgo: '5 saat önce',
    detectionRate: 0.91,
    totalRuns: 20,
    expectedDecision: 'BLOCK',
  },
  {
    id: 'sim-swap',
    name: 'SIM Swap',
    category: 'identity',
    description: 'Kısa sürede çok SIM — telco risk tetikleme bekleniyor',
    lastRunAgo: '2 gün önce',
    detectionRate: 0.78,
    totalRuns: 5,
    expectedDecision: 'REVIEW',
  },
];

type FilterCategory = 'all' | ScenarioCategory;
type SortKey = 'detectionRate' | 'name' | 'lastRunAgo';

const CATEGORY_LABELS: Record<FilterCategory, string> = {
  all: 'All',
  device: 'Device',
  velocity: 'Velocity',
  identity: 'Identity',
  bot: 'Bot',
  network: 'Network',
};

const CATEGORY_COLORS: Record<ScenarioCategory, string> = {
  device: 'bg-blue-900/40 text-blue-400',
  velocity: 'bg-purple-900/40 text-purple-400',
  identity: 'bg-orange-900/40 text-orange-400',
  bot: 'bg-red-900/40 text-red-400',
  network: 'bg-teal-900/40 text-teal-400',
};

function detectionBarColor(rate: number): string {
  if (rate >= 0.9) return 'bg-green-500';
  if (rate >= 0.7) return 'bg-yellow-400';
  return 'bg-red-500';
}

function expectedBadge(decision: ExpectedDecision) {
  if (decision === 'BLOCK') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-900/40 px-2 py-0.5 text-xs font-semibold text-red-400">
        BLOCK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-yellow-900/40 px-2 py-0.5 text-xs font-semibold text-yellow-400">
      REVIEW
    </span>
  );
}

function ScenarioCard({ scenario, onRun }: { scenario: Scenario; onRun: () => void }) {
  const pct = Math.round(scenario.detectionRate * 100);
  return (
    <div className="rounded-lg bg-surface-card shadow-md p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[scenario.category]}`}>
            {scenario.category}
          </span>
          <h3 className="text-sm font-semibold text-text-primary truncate">{scenario.name}</h3>
        </div>
        <button
          onClick={onRun}
          className="flex-shrink-0 flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover transition-colors"
          aria-label={`Run ${scenario.name}`}
        >
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          Run
        </button>
      </div>

      <p className="text-xs text-text-secondary">{scenario.description}</p>

      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span>Son: {scenario.lastRunAgo}</span>
        <span className="text-surface-border">|</span>
        <span>{scenario.totalRuns} çalıştırma</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary">Algılama</span>
          <span className="font-semibold tabular-nums text-text-primary">{pct}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-surface-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${detectionBarColor(scenario.detectionRate)}`}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">Beklenen:</span>
          {expectedBadge(scenario.expectedDecision)}
        </div>
      </div>
    </div>
  );
}

export default function ScenarioLibraryPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [sort, setSort] = useState<SortKey>('detectionRate');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim().toLowerCase());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const filtered = SCENARIOS.filter((s) => {
    if (filter !== 'all' && s.category !== filter) return false;
    if (search && !s.name.toLowerCase().includes(search) && !s.description.toLowerCase().includes(search)) return false;
    return true;
  }).sort((a, b) => {
    if (sort === 'detectionRate') return b.detectionRate - a.detectionRate;
    if (sort === 'name') return a.name.localeCompare(b.name);
    return 0; // lastRunAgo: keep original order for demo
  });

  return (
    <div className="p-6 space-y-6 max-w-content mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Scenario Library</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Fraud attack scenarios for adversarial testing
          </p>
        </div>
        <button
          disabled
          className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium text-text-muted cursor-not-allowed opacity-50"
          title="Available in Sprint 18"
        >
          + New Scenario
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(CATEGORY_LABELS) as FilterCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                filter === cat
                  ? 'bg-primary text-white'
                  : 'bg-surface-card text-text-secondary hover:text-text-primary border border-surface-border'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search scenarios..."
            className="w-44 rounded-md border border-surface-border bg-surface-card px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-surface-border bg-surface-card px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="detectionRate">Detection Rate</option>
            <option value="name">Name</option>
            <option value="lastRunAgo">Last Run</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg bg-surface-card shadow-md p-10 text-center">
          <p className="text-sm text-text-secondary">No scenarios match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              onRun={() => navigate('/fraud-tester/battle-arena')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
