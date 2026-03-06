export type BattleStatus = 'idle' | 'running' | 'paused' | 'completed';
export type AttackDecision = 'BLOCKED' | 'DETECTED' | 'MISSED';

export interface AttackResult {
  id: string;
  scenarioName: string;
  decision: AttackDecision;
  riskScore: number;
  latencyMs: number;
  timestamp: string;
}

export interface BattleStats {
  detectionRate: number; // 0-1
  tpr: number;
  fpr: number;
  avgLatencyMs: number;
  totalAttacks: number;
  blocked: number;
  detected: number;
  missed: number;
}

export interface BattleConfig {
  targetName: string;
  duration: '1min' | '5min' | '10min' | '30min';
  intensity: 'low' | 'medium' | 'high';
  enabledScenarios: string[];
}

export interface BattleHistoryEntry {
  id: string;
  timestamp: string;
  stats: BattleStats;
}

/** ScenarioResult mirrors apps/fraud-tester/src/scenarios/types.ts */
export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  totalEvents: number;
  detectedCount: number;
  /** Fraction of events correctly identified (TP / (TP + FN)) */
  detectionRate: number;
  avgLatencyMs: number;
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  /** True when detectionRate >= scenario minDetectionRate */
  passed: boolean;
}

/** BattleReport mirrors apps/fraud-tester/src/scenarios/types.ts */
export interface BattleReport {
  id: string;
  timestamp: string; // ISO string (backend uses Date, serialized to string)
  targetAdapter: string;
  scenarios: ScenarioResult[];
  overallTpr: number;
  overallFpr: number;
  avgLatencyMs: number;
}

export interface AgentConfig {
  fraudSim: AgentSettings;
  adversarial: AgentSettings;
  chaos: AgentSettings;
}

export interface AgentSettings {
  enabled: boolean;
  intensity: number; // 1-10
  schedule: 'manual' | 'hourly' | 'daily' | 'weekly';
  // Adversarial agent params
  attackPattern?: 'all' | 'emulator-bypass' | 'slow-fraud' | 'bot-evasion';
  // Chaos agent params
  chaosMode?: 'all' | 'timeout' | 'partialFailure' | 'stress';
  failureRate?: number;  // 0-0.5
  timeoutMs?: number;    // ms
}
