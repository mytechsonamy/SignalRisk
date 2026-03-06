/**
 * FraudTester — Scenario Orchestrator
 *
 * ScenarioRunner iterates over all provided scenarios, submits each generated
 * event to the target adapter, and emits 'result' events in real time.
 * Individual scenario failures are caught and logged so the remaining
 * scenarios continue to run. A BattleReport is returned on completion.
 */

import { EventEmitter } from 'events';
import type { IFraudSystemAdapter } from '../adapters/base.adapter';
import { DetectionReporter } from '../reporter/detection-reporter';
import type { AttackResult, BattleReport, FraudScenario, ScenarioResult } from '../scenarios/types';

export class ScenarioRunner extends EventEmitter {
  private readonly reporter = new DetectionReporter();
  private _stopped = false;

  /**
   * Request a graceful stop. The current event will finish, then no further
   * events or scenarios will be processed.
   */
  stop(): void {
    this._stopped = true;
  }

  /**
   * Run all scenarios against the provided adapter.
   * Emits 'result' (AttackResult) after each event, 'scenarioDone' (ScenarioResult)
   * after each scenario, and returns the final BattleReport.
   */
  async run(
    scenarios: FraudScenario[],
    adapter: IFraudSystemAdapter,
  ): Promise<BattleReport> {
    const scenarioResults: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      if (this._stopped) break;

      try {
        const scenarioResult = await this.runScenario(scenario, adapter);
        scenarioResults.push(scenarioResult);
        this.emit('scenarioDone', scenarioResult);
      } catch (err) {
        console.error(
          `[ScenarioRunner] Scenario '${scenario.id}' failed fatally:`,
          err instanceof Error ? err.message : err,
        );
        // Record a zeroed result so BattleReport totals are not skewed
        scenarioResults.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          totalEvents: 0,
          detectedCount: 0,
          detectionRate: 0,
          avgLatencyMs: 0,
          tp: 0,
          tn: 0,
          fp: 0,
          fn: 0,
          passed: false,
        });
      }
    }

    return this.reporter.computeBattleReport(scenarioResults, adapter.name);
  }

  private async runScenario(
    scenario: FraudScenario,
    adapter: IFraudSystemAdapter,
  ): Promise<ScenarioResult> {
    const attackResults: AttackResult[] = [];

    for await (const event of scenario.generate()) {
      if (this._stopped) break;

      // Check again after the generator yield to catch stop() calls that arrive
      // while the event loop is processing async generator internals.
      await Promise.resolve();
      if (this._stopped) break;

      try {
        const decision = await adapter.submitEvent(event);
        const detected =
          decision.decision === scenario.expectedOutcome.decision ||
          (scenario.expectedOutcome.decision === 'BLOCK' && decision.decision === 'REVIEW');

        const result: AttackResult = { event, decision, detected };
        attackResults.push(result);
        this.emit('result', result);
      } catch (err) {
        console.warn(
          `[ScenarioRunner] Event '${event.eventId}' in scenario '${scenario.id}' errored:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return this.reporter.compute(attackResults, scenario);
  }
}
