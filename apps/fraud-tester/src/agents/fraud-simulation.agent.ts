/**
 * FraudTester — Fraud Simulation Agent
 *
 * Runs the full catalogue of 5 fraud scenarios (device-farm, bot-checkout,
 * velocity-evasion, emulator-spoof, sim-swap) against the provided adapter
 * and returns a consolidated BattleReport.
 */

import type { IFraudSystemAdapter } from '../adapters/base.adapter';
import type { BattleReport } from '../scenarios/types';
import { botCheckoutScenario } from '../scenarios/catalog/bot-checkout.scenario';
import { deviceFarmScenario } from '../scenarios/catalog/device-farm.scenario';
import { emulatorSpoofScenario } from '../scenarios/catalog/emulator-spoof.scenario';
import { simSwapScenario } from '../scenarios/catalog/sim-swap.scenario';
import { velocityEvasionScenario } from '../scenarios/catalog/velocity-evasion.scenario';
import { ScenarioRunner } from '../orchestrator/orchestrator';
import type { IFraudTestAgent } from './base.agent';

const ALL_SCENARIOS = [
  deviceFarmScenario,
  botCheckoutScenario,
  velocityEvasionScenario,
  emulatorSpoofScenario,
  simSwapScenario,
];

export class FraudSimulationAgent implements IFraudTestAgent {
  readonly name = 'FraudSimulationAgent';

  private status: 'idle' | 'running' | 'stopped' = 'idle';
  private runner: ScenarioRunner | null = null;

  async run(adapter: IFraudSystemAdapter): Promise<BattleReport> {
    if (this.status === 'stopped') {
      throw new Error('FraudSimulationAgent: agent has been stopped and cannot be reused');
    }

    this.status = 'running';
    this.runner = new ScenarioRunner();

    try {
      const report = await this.runner.run(ALL_SCENARIOS, adapter);
      return report;
    } finally {
      if (this.status === 'running') {
        this.status = 'idle';
      }
    }
  }

  stop(): void {
    this.status = 'stopped';
  }

  getStatus(): 'idle' | 'running' | 'stopped' {
    return this.status;
  }
}
