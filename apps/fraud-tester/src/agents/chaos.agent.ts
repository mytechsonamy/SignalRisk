/**
 * FraudTester — Chaos Agent
 *
 * Wraps real fraud scenarios in a ChaosAdapterWrapper that injects failures,
 * timeouts or artificial delays so we can verify the system degrades gracefully
 * rather than crashing entirely.
 *
 * Modes:
 *   timeout        — every submitEvent races against a 3-second timer
 *   partialFailure — 30 % of submitEvent calls throw an injected error
 *   stress         — every submitEvent is preceded by a 50 ms artificial delay
 *   all            — runs all three chaos configurations sequentially
 *
 * The resulting BattleReport contains one ScenarioResult per (scenario × mode)
 * combination.  The top-level `chaosSuccess` flag (carried in the report's
 * targetAdapter name for now) is true when at least 50 % of events across all
 * modes were processed successfully — i.e. graceful degradation is confirmed.
 */

import { EventEmitter } from 'events';
import type { IFraudSystemAdapter } from '../adapters/base.adapter';
import { ChaosAdapterWrapper, type ChaosConfig } from '../adapters/chaos-wrapper';
import { ScenarioRunner } from '../orchestrator/orchestrator';
import { DetectionReporter } from '../reporter/detection-reporter';
import { botCheckoutScenario } from '../scenarios/catalog/bot-checkout.scenario';
import { deviceFarmScenario } from '../scenarios/catalog/device-farm.scenario';
import type { BattleReport, ScenarioResult } from '../scenarios/types';
import type { IFraudTestAgent } from './base.agent';

export type ChaosMode = 'timeout' | 'partialFailure' | 'stress' | 'all';

const CHAOS_SCENARIOS = [deviceFarmScenario, botCheckoutScenario];

export class ChaosAgent extends EventEmitter implements IFraudTestAgent {
  readonly name = 'ChaosAgent';
  private status: 'idle' | 'running' | 'stopped' = 'idle';

  constructor(private readonly mode: ChaosMode = 'all') {
    super();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getChaosConfigs(): ChaosConfig[] {
    switch (this.mode) {
      case 'timeout':
        return [{ type: 'timeout', timeoutMs: 3000 }];
      case 'partialFailure':
        return [{ type: 'partialFailure', failureRate: 0.3 }];
      case 'stress':
        return [{ type: 'stress', delayMs: 20 }];
      case 'all':
        return [
          { type: 'timeout', timeoutMs: 3000 },
          { type: 'partialFailure', failureRate: 0.3 },
          { type: 'stress', delayMs: 20 },
        ];
    }
  }

  // ---------------------------------------------------------------------------
  // IFraudTestAgent
  // ---------------------------------------------------------------------------

  async run(adapter: IFraudSystemAdapter): Promise<BattleReport> {
    this.status = 'running';

    const configs = this.getChaosConfigs();
    const allScenarioResults: ScenarioResult[] = [];

    for (const config of configs) {
      if ((this.status as string) === 'stopped') break;

      const wrappedAdapter = new ChaosAdapterWrapper(adapter, config);
      const runner = new ScenarioRunner();

      // Forward granular events to our own listeners
      runner.on('result', (r) => this.emit('result', r));
      runner.on('scenarioDone', (r) => this.emit('scenarioDone', r));

      try {
        const report = await runner.run(CHAOS_SCENARIOS, wrappedAdapter);
        allScenarioResults.push(...report.scenarios);
      } catch (err) {
        // A fatal runner error for one config should not abort the rest
        console.error(
          `[ChaosAgent] Config type='${config.type}' failed fatally:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Build a consolidated BattleReport from all per-config scenario results
    const reporter = new DetectionReporter();

    // chaosSuccess: at least 50% of total events were processed (graceful degradation)
    const totalEvents = allScenarioResults.reduce((s, r) => s + r.totalEvents, 0);
    const expectedEventsPerRun = CHAOS_SCENARIOS.length * 50; // 50 events per scenario
    const expectedTotal = configs.length * expectedEventsPerRun;
    const chaosSuccess = expectedTotal === 0 || totalEvents / expectedTotal >= 0.5;

    const adapterLabel = `${adapter.name}[chaos=${this.mode},success=${chaosSuccess}]`;
    const report = reporter.computeBattleReport(allScenarioResults, adapterLabel);

    this.status = 'idle';
    this.emit('complete', report);
    return report;
  }

  stop(): void {
    this.status = 'stopped';
  }

  getStatus(): 'idle' | 'running' | 'stopped' {
    return this.status;
  }
}
