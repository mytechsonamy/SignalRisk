/**
 * FraudTester — Base Agent Interface
 *
 * An agent orchestrates one or more scenario runs and returns a BattleReport.
 * Agents encapsulate the strategy for which scenarios to run, in what order,
 * and how to interpret results — keeping the runner and reporter reusable.
 */

import type { IFraudSystemAdapter } from '../adapters/base.adapter';
import type { BattleReport } from '../scenarios/types';

export interface IFraudTestAgent {
  readonly name: string;

  /**
   * Execute the agent's test strategy against the given adapter.
   * Returns a BattleReport summarising all scenario results.
   */
  run(adapter: IFraudSystemAdapter): Promise<BattleReport>;

  /**
   * Request a graceful stop. The agent should not accept new work after this
   * call and should allow in-flight scenarios to complete.
   */
  stop(): void;

  /**
   * Current lifecycle state of the agent.
   */
  getStatus(): 'idle' | 'running' | 'stopped';
}
