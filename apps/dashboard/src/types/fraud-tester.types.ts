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
