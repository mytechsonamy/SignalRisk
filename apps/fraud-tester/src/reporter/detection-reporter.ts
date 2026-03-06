/**
 * FraudTester — Detection Reporter
 *
 * Aggregates raw AttackResult records into ScenarioResult and BattleReport
 * summaries. Computes TP/FP/FN/TN, detection rate (TPR), and FPR.
 *
 * Classification rules:
 *   TP: system said BLOCK/REVIEW and scenario expected BLOCK/REVIEW
 *   FP: system said BLOCK/REVIEW but scenario expected ALLOW (none of our
 *       current scenarios have ALLOW expected, but the contract must handle it)
 *   FN: system said ALLOW but scenario expected BLOCK/REVIEW
 *   TN: system said ALLOW and scenario expected ALLOW
 */

import { randomUUID } from 'crypto';
import type { AttackResult, BattleReport, FraudScenario, ScenarioResult } from '../scenarios/types';

export class DetectionReporter {
  /**
   * Compute TP/FP/FN/TN and derived metrics for a single scenario run.
   */
  compute(results: AttackResult[], scenario: FraudScenario): ScenarioResult {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;
    let totalLatency = 0;

    const expectedPositive =
      scenario.expectedOutcome.decision === 'BLOCK' ||
      scenario.expectedOutcome.decision === 'REVIEW';

    for (const result of results) {
      const systemPositive =
        result.decision.decision === 'BLOCK' ||
        result.decision.decision === 'REVIEW';

      totalLatency += result.decision.latencyMs;

      if (expectedPositive && systemPositive) tp++;
      else if (!expectedPositive && systemPositive) fp++;
      else if (expectedPositive && !systemPositive) fn++;
      else tn++;
    }

    const detectedCount = tp;
    const totalEvents = results.length;
    const detectionRate = tp + fn > 0 ? tp / (tp + fn) : 0;
    const avgLatencyMs = totalEvents > 0 ? totalLatency / totalEvents : 0;
    const passed = detectionRate >= scenario.expectedOutcome.minDetectionRate;

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      totalEvents,
      detectedCount,
      detectionRate,
      avgLatencyMs,
      tp,
      tn,
      fp,
      fn,
      passed,
    };
  }

  /**
   * Aggregate per-scenario results into an overall BattleReport.
   * overallTpr = mean of scenario detection rates (TPR).
   * overallFpr = mean of per-scenario FPRs.
   */
  computeBattleReport(results: ScenarioResult[], adapterName: string): BattleReport {
    const totalLatency = results.reduce((sum, r) => sum + r.avgLatencyMs, 0);
    const avgLatencyMs = results.length > 0 ? totalLatency / results.length : 0;

    const overallTpr =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.detectionRate, 0) / results.length
        : 0;

    const overallFpr =
      results.length > 0
        ? results.reduce((sum, r) => {
            const fpr = r.fp + r.tn > 0 ? r.fp / (r.fp + r.tn) : 0;
            return sum + fpr;
          }, 0) / results.length
        : 0;

    return {
      id: randomUUID(),
      timestamp: new Date(),
      targetAdapter: adapterName,
      scenarios: results,
      overallTpr,
      overallFpr,
      avgLatencyMs,
    };
  }
}
