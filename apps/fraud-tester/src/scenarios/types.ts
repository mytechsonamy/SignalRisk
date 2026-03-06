/**
 * FraudTester — Scenario Type Definitions
 *
 * All scenario implementations must conform to FraudScenario.
 * Results are aggregated by the DetectionReporter into ScenarioResult
 * and BattleReport structures for display / CI assertion.
 */

import type { FraudDecision, FraudTestEvent } from '../adapters/base.adapter';

export type { FraudDecision, FraudTestEvent };

export interface FraudScenario {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: 'device' | 'velocity' | 'identity' | 'bot' | 'network';
  readonly expectedOutcome: {
    /** Minimum risk score expected from the target system (0–1). */
    minRiskScore: number;
    /** The decision verdict we expect the system to produce. */
    decision: 'BLOCK' | 'REVIEW';
    /** Minimum fraction of events that must be correctly detected (0–1). */
    minDetectionRate: number;
  };

  /**
   * Async generator yielding FraudTestEvents for this scenario.
   * @param seed Optional deterministic seed for reproducible output.
   */
  generate(seed?: number): AsyncGenerator<FraudTestEvent>;
}

export interface AttackResult {
  event: FraudTestEvent;
  decision: FraudDecision;
  /** True when the system decision matches the scenario expectedOutcome. */
  detected: boolean;
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  totalEvents: number;
  detectedCount: number;
  /** Fraction of events correctly identified as fraudulent (TP / (TP + FN)). */
  detectionRate: number;
  avgLatencyMs: number;
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  /** True when detectionRate >= scenario.expectedOutcome.minDetectionRate. */
  passed: boolean;
}

export interface BattleReport {
  id: string;
  timestamp: Date;
  targetAdapter: string;
  scenarios: ScenarioResult[];
  /** Overall True Positive Rate across all scenarios. */
  overallTpr: number;
  /** Overall False Positive Rate across all scenarios. */
  overallFpr: number;
  avgLatencyMs: number;
}
