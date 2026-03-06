/**
 * SignalRisk Behavioral Service — Type definitions
 *
 * Shared interfaces for session attributes and behavioral analysis results.
 */

export interface SessionAttributes {
  sessionId: string;
  merchantId: string;
  timingCv?: number;
  navigationEntropy?: number;
  scrollVelocity?: number;
  formFillSpeed?: number;
  hasWebGl?: boolean;
  hasCanvas?: boolean;
  mouseJitter?: boolean;
  clickCount?: number;
}

export interface BehavioralResult {
  sessionRiskScore: number;   // 0-100
  botProbability: number;     // 0-1
  isBot: boolean;
  indicators: string[];
  anomalyScore: number;       // z-score magnitude from ML baseline (0 = normal, >3 = highly anomalous)
  usedMlScoring: boolean;     // false when cold-start heuristic was used
}
