/**
 * FraudTester — Adversarial Agent
 *
 * Runs adversarial scenarios that attempt to EVADE the fraud system rather than
 * trigger it. A low detection rate (overallTpr < 0.5) means the agent succeeded
 * in bypassing the system — adversarialSuccess: true.
 *
 * Three attack patterns are available:
 *   'emulator-bypass' — realistic device metadata to evade emulator detection
 *   'slow-fraud'      — timestamp manipulation to evade velocity detection
 *   'bot-evasion'     — human-like browser signals to evade bot detection
 *   'all'             — run all three (default)
 *
 * Emits:
 *   'result'       (AttackResult)   — after each individual event
 *   'scenarioDone' (ScenarioResult) — after each scenario completes
 *   'complete'     (BattleReport)   — when all scenarios finish
 */

import { EventEmitter } from 'events';
import type { IFraudSystemAdapter } from '../adapters/base.adapter';
import type { AttackResult, BattleReport, FraudScenario } from '../scenarios/types';
import type { IFraudTestAgent } from './base.agent';
import { emulatorBypassScenario } from '../scenarios/catalog/adversarial/emulator-bypass.scenario';
import { slowFraudScenario } from '../scenarios/catalog/adversarial/slow-fraud.scenario';
import { botEvasionScenario } from '../scenarios/catalog/adversarial/bot-evasion.scenario';
import { ScenarioRunner } from '../orchestrator/orchestrator';

export type AdversarialPattern = 'emulator-bypass' | 'slow-fraud' | 'bot-evasion' | 'all';

const ALL_ADVERSARIAL_SCENARIOS: FraudScenario[] = [
  emulatorBypassScenario,
  slowFraudScenario,
  botEvasionScenario,
];

export class AdversarialAgent extends EventEmitter implements IFraudTestAgent {
  readonly name = 'AdversarialAgent';

  private status: 'idle' | 'running' | 'stopped' = 'idle';
  private runner: ScenarioRunner | null = null;

  constructor(private readonly pattern: AdversarialPattern = 'all') {
    super();
  }

  private getScenarios(): FraudScenario[] {
    switch (this.pattern) {
      case 'emulator-bypass':
        return [emulatorBypassScenario];
      case 'slow-fraud':
        return [slowFraudScenario];
      case 'bot-evasion':
        return [botEvasionScenario];
      case 'all':
      default:
        return ALL_ADVERSARIAL_SCENARIOS;
    }
  }

  async run(adapter: IFraudSystemAdapter): Promise<BattleReport> {
    if (this.status === 'stopped') {
      throw new Error('AdversarialAgent: agent has been stopped and cannot be reused');
    }

    this.status = 'running';
    this.runner = new ScenarioRunner();

    // Forward ScenarioRunner events to our own listeners
    this.runner.on('result', (result: AttackResult) => this.emit('result', result));
    this.runner.on('scenarioDone', (scenarioResult) => this.emit('scenarioDone', scenarioResult));

    const scenarios = this.getScenarios();

    try {
      const report = await this.runner.run(scenarios, adapter);

      // Adversarial success: the system allowed (passed through) more than half of the
      // evasion events — computed as the overall pass-through rate across all scenarios.
      // pass-through events = fn (expected positive, system said ALLOW) +
      //                       tn (expected ALLOW, system said ALLOW)
      const totalEvents = report.scenarios.reduce((sum, s) => sum + s.totalEvents, 0);
      const allowedEvents = report.scenarios.reduce(
        (sum, s) => sum + s.fn + s.tn,
        0,
      );
      const allowedRate = totalEvents > 0 ? allowedEvents / totalEvents : 0;

      const adversarialReport: BattleReport = {
        ...report,
        adversarialSuccess: allowedRate > 0.5,
        agentName: this.name,
      };

      // Preserve 'stopped' status if stop() was called during the run
      const wasStopped = this.status === ('stopped' as string);
      if (!wasStopped) {
        this.status = 'idle';
        this.emit('complete', adversarialReport);
      }

      return adversarialReport;
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
