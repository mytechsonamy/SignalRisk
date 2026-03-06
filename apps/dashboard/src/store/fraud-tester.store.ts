import { create } from 'zustand';
import type {
  BattleStatus,
  BattleStats,
  AttackResult,
  BattleConfig,
  BattleHistoryEntry,
  AttackDecision,
} from '../types/fraud-tester.types';

interface FraudTesterStore {
  battleStatus: BattleStatus;
  stats: BattleStats;
  liveFeed: AttackResult[];
  battleHistory: BattleHistoryEntry[];
  config: BattleConfig;
  startBattle: () => void;
  stopBattle: () => void;
  updateConfig: (partial: Partial<BattleConfig>) => void;
  _addResult: (result: AttackResult) => void;
}

const DEMO_SCENARIOS = [
  'Device Farm',
  'Emulator Spoof',
  'Bot Checkout',
  'Velocity Evasion',
  'SIM Swap',
];

function pickDecision(): AttackDecision {
  const r = Math.random();
  if (r < 0.70) return 'BLOCKED';
  if (r < 0.85) return 'DETECTED';
  return 'MISSED';
}

function calcStats(feed: AttackResult[]): BattleStats {
  const totalAttacks = feed.length;
  if (totalAttacks === 0) {
    return { detectionRate: 0, tpr: 0, fpr: 0, avgLatencyMs: 0, totalAttacks: 0, blocked: 0, detected: 0, missed: 0 };
  }
  const blocked = feed.filter((r) => r.decision === 'BLOCKED').length;
  const detected = feed.filter((r) => r.decision === 'DETECTED').length;
  const missed = feed.filter((r) => r.decision === 'MISSED').length;
  const detectionRate = (blocked + detected) / totalAttacks;
  const tpr = totalAttacks > 0 ? (blocked + detected) / totalAttacks : 0;
  const fpr = totalAttacks > 0 ? missed / totalAttacks : 0;
  const avgLatencyMs = Math.round(feed.reduce((acc, r) => acc + r.latencyMs, 0) / totalAttacks);
  return { detectionRate, tpr, fpr, avgLatencyMs, totalAttacks, blocked, detected, missed };
}

const MOCK_HISTORY: BattleHistoryEntry[] = [
  {
    id: 'hist-1',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    stats: { detectionRate: 0.88, tpr: 0.88, fpr: 0.12, avgLatencyMs: 142, totalAttacks: 50, blocked: 35, detected: 9, missed: 6 },
  },
  {
    id: 'hist-2',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    stats: { detectionRate: 0.82, tpr: 0.82, fpr: 0.18, avgLatencyMs: 158, totalAttacks: 40, blocked: 28, detected: 5, missed: 7 },
  },
  {
    id: 'hist-3',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    stats: { detectionRate: 0.76, tpr: 0.76, fpr: 0.24, avgLatencyMs: 171, totalAttacks: 60, blocked: 38, detected: 8, missed: 14 },
  },
];

let _intervalId: ReturnType<typeof setInterval> | null = null;

export const useFraudTesterStore = create<FraudTesterStore>((set, get) => ({
  battleStatus: 'idle',
  stats: { detectionRate: 0, tpr: 0, fpr: 0, avgLatencyMs: 0, totalAttacks: 0, blocked: 0, detected: 0, missed: 0 },
  liveFeed: [],
  battleHistory: MOCK_HISTORY,
  config: {
    targetName: 'SignalRisk',
    duration: '5min',
    intensity: 'medium',
    enabledScenarios: [...DEMO_SCENARIOS],
  },

  startBattle: () => {
    set({ battleStatus: 'running', liveFeed: [], stats: { detectionRate: 0, tpr: 0, fpr: 0, avgLatencyMs: 0, totalAttacks: 0, blocked: 0, detected: 0, missed: 0 } });

    _intervalId = setInterval(() => {
      const { battleStatus, config } = get();
      if (battleStatus !== 'running') {
        if (_intervalId) clearInterval(_intervalId);
        return;
      }

      const enabledScenarios = config.enabledScenarios.length > 0 ? config.enabledScenarios : DEMO_SCENARIOS;
      const scenarioName = enabledScenarios[Math.floor(Math.random() * enabledScenarios.length)];
      const decision = pickDecision();
      const baseLatency = config.intensity === 'low' ? 80 : config.intensity === 'medium' ? 140 : 200;
      const result: AttackResult = {
        id: `atk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        scenarioName,
        decision,
        riskScore: Math.round((0.5 + Math.random() * 0.5) * 100) / 100,
        latencyMs: baseLatency + Math.round(Math.random() * 60),
        timestamp: new Date().toISOString(),
      };

      get()._addResult(result);
    }, 600);
  },

  stopBattle: () => {
    if (_intervalId) {
      clearInterval(_intervalId);
      _intervalId = null;
    }

    const { stats, battleHistory } = get();
    const historyEntry: BattleHistoryEntry = {
      id: `battle-${Date.now()}`,
      timestamp: new Date().toISOString(),
      stats: { ...stats },
    };

    set({
      battleStatus: 'completed',
      battleHistory: [historyEntry, ...battleHistory].slice(0, 10),
    });
  },

  updateConfig: (partial) => {
    set((state) => ({ config: { ...state.config, ...partial } }));
  },

  _addResult: (result) => {
    set((state) => {
      const newFeed = [result, ...state.liveFeed].slice(0, 50);
      const newStats = calcStats(newFeed);
      return { liveFeed: newFeed, stats: newStats };
    });
  },
}));
