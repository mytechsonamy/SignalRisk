/**
 * FraudTester — Fraud Simulation Agent
 *
 * Runs the full catalogue of 5 fraud scenarios (device-farm, bot-checkout,
 * velocity-evasion, emulator-spoof, sim-swap) against the provided adapter
 * and returns a consolidated BattleReport.
 *
 * Extends EventEmitter so callers can stream per-event results in real time:
 *   agent.on('result', (r: AttackResult) => ...)
 *   agent.on('scenarioDone', (r: ScenarioResult) => ...)
 *   agent.on('complete', (report: BattleReport) => ...)
 */

import { EventEmitter } from 'events';
import type { IFraudSystemAdapter } from '../adapters/base.adapter';
import type { AttackResult, BattleReport, FraudScenario } from '../scenarios/types';
import { botCheckoutScenario } from '../scenarios/catalog/bot-checkout.scenario';
import { deviceFarmScenario } from '../scenarios/catalog/device-farm.scenario';
import { emulatorSpoofScenario } from '../scenarios/catalog/emulator-spoof.scenario';
import { simSwapScenario } from '../scenarios/catalog/sim-swap.scenario';
import { velocityEvasionScenario } from '../scenarios/catalog/velocity-evasion.scenario';
import { ScenarioRunner } from '../orchestrator/orchestrator';
import type { IFraudTestAgent } from './base.agent';

const DEFAULT_SCENARIOS: FraudScenario[] = [
  deviceFarmScenario,
  botCheckoutScenario,
  velocityEvasionScenario,
  emulatorSpoofScenario,
  simSwapScenario,
];

export class FraudSimulationAgent extends EventEmitter implements IFraudTestAgent {
  readonly name = 'FraudSimulationAgent';

  private status: 'idle' | 'running' | 'stopped' = 'idle';
  private runner: ScenarioRunner | null = null;
  private readonly scenarios: FraudScenario[];

  constructor(scenarios: FraudScenario[] = DEFAULT_SCENARIOS) {
    super();
    this.scenarios = scenarios;
  }

  async run(adapter: IFraudSystemAdapter): Promise<BattleReport> {
    if (this.status === 'stopped') {
      throw new Error('FraudSimulationAgent: agent has been stopped and cannot be reused');
    }

    this.status = 'running';
    this.runner = new ScenarioRunner();

    // Forward ScenarioRunner events to our own listeners
    this.runner.on('result', (result: AttackResult) => this.emit('result', result));
    this.runner.on('scenarioDone', (scenarioResult) => this.emit('scenarioDone', scenarioResult));

    try {
      const report = await this.runner.run(this.scenarios, adapter);
      // If stop() was called during the run, preserve 'stopped' status
      const wasStopped = this.status === ('stopped' as string);
      if (!wasStopped) {
        this.status = 'idle';
        this.emit('complete', report);
      }
      return report;
    } catch (err) {
      this.status = 'stopped';
      throw err;
    }
  }

  stop(): void {
    this.status = 'stopped';
    if (this.runner) {
      this.runner.stop();
    }
  }

  getStatus(): 'idle' | 'running' | 'stopped' {
    return this.status;
  }
}
