/**
 * FraudTester — Chaos Agent (Sprint 18 placeholder)
 *
 * Will implement randomised, high-volume stress scenarios that combine
 * multiple attack patterns simultaneously to test system resilience
 * under concurrent fraud load.
 */

import type { IFraudSystemAdapter } from '../adapters/base.adapter';
import type { BattleReport } from '../scenarios/types';
import type { IFraudTestAgent } from './base.agent';

export class ChaosAgent implements IFraudTestAgent {
  readonly name = 'ChaosAgent';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async run(_adapter: IFraudSystemAdapter): Promise<BattleReport> {
    throw new Error('ChaosAgent not implemented — Sprint 18');
  }

  stop(): void {
    // No-op until implemented
  }

  getStatus(): 'idle' | 'running' | 'stopped' {
    return 'idle';
  }
}
