import { create } from 'zustand';
import type {
  BattleStatus,
  BattleStats,
  AttackResult,
  BattleConfig,
  BattleHistoryEntry,
  AttackDecision,
  BattleReport,
  AgentConfig,
  AdapterTarget,
} from '../types/fraud-tester.types';

interface FraudTesterStore {
  battleStatus: BattleStatus;
  stats: BattleStats;
  liveFeed: AttackResult[];
  battleHistory: BattleHistoryEntry[];
  config: BattleConfig;
  activeBattleId: string | null;
  agentConfig: AgentConfig;
  targets: AdapterTarget[];
  activeTargetId: string;
  startBattle: () => void;
  stopBattle: () => void;
  updateConfig: (partial: Partial<BattleConfig>) => void;
  updateAgentConfig: (partial: Partial<AgentConfig>) => void;
  addTarget: (target: Omit<AdapterTarget, 'id'>) => void;
  removeTarget: (id: string) => void;
  setActiveTarget: (id: string) => void;
  updateTargetStatus: (id: string, status: AdapterTarget['connectionStatus']) => void;
  _addResult: (result: AttackResult) => void;
  _completeBattle: (report: BattleReport) => void;
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

// Socket.io client — loaded lazily so SSR / build doesn't break when server is absent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _socket: any = null;

const FRAUD_TESTER_URL =
  typeof window !== 'undefined'
    ? (import.meta.env?.VITE_FRAUD_TESTER_URL ?? 'http://localhost:3020')
    : 'http://localhost:3020';

function stopMockInterval() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

function disconnectSocket() {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}

export const useFraudTesterStore = create<FraudTesterStore>((set, get) => ({
  battleStatus: 'idle',
  stats: { detectionRate: 0, tpr: 0, fpr: 0, avgLatencyMs: 0, totalAttacks: 0, blocked: 0, detected: 0, missed: 0 },
  liveFeed: [],
  battleHistory: MOCK_HISTORY,
  activeBattleId: null,
  config: {
    targetName: 'SignalRisk',
    duration: '5min',
    intensity: 'medium',
    enabledScenarios: [...DEMO_SCENARIOS],
  },
  agentConfig: {
    fraudSim: { enabled: true, intensity: 5, schedule: 'manual' },
    adversarial: { enabled: true, intensity: 5, schedule: 'manual', attackPattern: 'all' },
    chaos: { enabled: true, intensity: 3, schedule: 'manual', chaosMode: 'all', failureRate: 0.3, timeoutMs: 5000 },
  },
  targets: [
    {
      id: 'signalrisk-default',
      name: 'SignalRisk',
      type: 'signalrisk',
      baseUrl: 'http://localhost:3002',
      isDefault: true,
      connectionStatus: 'unknown',
    },
  ],
  activeTargetId: 'signalrisk-default',

  startBattle: () => {
    set({
      battleStatus: 'running',
      liveFeed: [],
      activeBattleId: null,
      stats: { detectionRate: 0, tpr: 0, fpr: 0, avgLatencyMs: 0, totalAttacks: 0, blocked: 0, detected: 0, missed: 0 },
    });

    const { config, activeTargetId } = get();
    const battleConfig = { ...config, targetAdapter: activeTargetId };

    function startMockBattle() {
      stopMockInterval();
      _intervalId = setInterval(() => {
        const { battleStatus, config: cfg } = get();
        if (battleStatus !== 'running') {
          stopMockInterval();
          return;
        }

        const enabledScenarios = cfg.enabledScenarios.length > 0 ? cfg.enabledScenarios : DEMO_SCENARIOS;
        const scenarioName = enabledScenarios[Math.floor(Math.random() * enabledScenarios.length)];
        const decision = pickDecision();
        const baseLatency = cfg.intensity === 'low' ? 80 : cfg.intensity === 'medium' ? 140 : 200;
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
    }

    // Attempt Socket.io connection to fraud-tester server
    // socket.io-client is a real dependency — dynamic import used for graceful fallback
    import('socket.io-client')
      .then(({ io }) => {
        let socketConnected = false;
        const socket = io(FRAUD_TESTER_URL, { timeout: 3000, reconnection: false });
        _socket = socket;

        const connectTimeout = setTimeout(() => {
          if (!socketConnected) {
            socket.disconnect();
            _socket = null;
            startMockBattle();
          }
        }, 3000);

        socket.on('connect', () => {
          socketConnected = true;
          clearTimeout(connectTimeout);

          // Start a battle via API then join room
          fetch(`${FRAUD_TESTER_URL}/v1/fraud-tester/battles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(battleConfig),
          })
            .then((r) => r.json() as Promise<{ battleId: string }>)
            .then(({ battleId }) => {
              set({ activeBattleId: battleId });
              socket.emit('join:battle', battleId);
            })
            .catch(() => {
              // Fraud-tester API unavailable — fall back to mock
              socket.disconnect();
              _socket = null;
              startMockBattle();
            });
        });

        socket.on('battle:result', (result: AttackResult) => {
          get()._addResult(result);
        });

        socket.on('battle:complete', (report: BattleReport) => {
          get()._completeBattle(report);
        });

        socket.on('connect_error', () => {
          if (!socketConnected) {
            clearTimeout(connectTimeout);
            socket.disconnect();
            _socket = null;
            startMockBattle();
          }
        });
      })
      .catch(() => {
        // socket.io-client not available — use mock
        startMockBattle();
      });
  },

  stopBattle: () => {
    stopMockInterval();

    const { activeBattleId } = get();

    if (_socket) {
      if (activeBattleId) {
        fetch(`${FRAUD_TESTER_URL}/v1/fraud-tester/battles/${activeBattleId}/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }).catch(() => { /* ignore */ });
      }
      _socket.off('battle:result');
      _socket.off('battle:complete');
      disconnectSocket();
    }

    const { stats, battleHistory } = get();
    const historyEntry: BattleHistoryEntry = {
      id: `battle-${Date.now()}`,
      timestamp: new Date().toISOString(),
      stats: { ...stats },
    };

    set({
      battleStatus: 'completed',
      activeBattleId: null,
      battleHistory: [historyEntry, ...battleHistory].slice(0, 10),
    });
  },

  updateConfig: (partial) => {
    set((state) => ({ config: { ...state.config, ...partial } }));
  },

  updateAgentConfig: (partial) => {
    set((state) => ({ agentConfig: { ...state.agentConfig, ...partial } }));
  },

  addTarget: (target) => {
    const id = `target-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({
      targets: [...state.targets, { ...target, id }],
    }));
  },

  removeTarget: (id) => {
    set((state) => ({
      targets: state.targets.filter((t) => t.id !== id),
      activeTargetId: state.activeTargetId === id ? 'signalrisk-default' : state.activeTargetId,
    }));
  },

  setActiveTarget: (id) => {
    set({ activeTargetId: id });
  },

  updateTargetStatus: (id, status) => {
    set((state) => ({
      targets: state.targets.map((t) =>
        t.id === id
          ? { ...t, connectionStatus: status, lastTestedAt: status === 'connected' || status === 'failed' ? new Date() : t.lastTestedAt }
          : t,
      ),
    }));
  },

  _addResult: (result) => {
    set((state) => {
      const newFeed = [result, ...state.liveFeed].slice(0, 50);
      const newStats = calcStats(newFeed);
      return { liveFeed: newFeed, stats: newStats };
    });
  },

  _completeBattle: (report) => {
    stopMockInterval();
    disconnectSocket();

    const historyEntry: BattleHistoryEntry = {
      id: report.id,
      timestamp: typeof report.timestamp === 'string' ? report.timestamp : new Date(report.timestamp).toISOString(),
      stats: {
        detectionRate: report.overallTpr,
        tpr: report.overallTpr,
        fpr: report.overallFpr,
        avgLatencyMs: report.avgLatencyMs,
        totalAttacks: report.scenarios.reduce((acc, s) => acc + s.totalEvents, 0),
        blocked: report.scenarios.reduce((acc, s) => acc + s.tp, 0),
        detected: report.scenarios.reduce((acc, s) => acc + s.tn, 0),
        missed: report.scenarios.reduce((acc, s) => acc + s.fn, 0),
      },
    };

    set((state) => ({
      battleStatus: 'completed',
      activeBattleId: null,
      battleHistory: [historyEntry, ...state.battleHistory].slice(0, 10),
    }));
  },
}));
