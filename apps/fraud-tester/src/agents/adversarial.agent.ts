/**
 * FraudTester — Adversarial Agent (Sprint 18 placeholder)
 *
 * Will implement adaptive attack strategies that mutate event payloads
 * based on observed system responses to find detection blind spots.
 */

import type { IFraudSystemAdapter } from '../adapters/base.adapter';
import type { BattleReport } from '../scenarios/types';
import type { IFraudTestAgent } from './base.agent';

export class AdversarialAgent implements IFraudTestAgent {
  readonly name = 'AdversarialAgent';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async run(_adapter: IFraudSystemAdapter): Promise<BattleReport> {
    throw new Error('AdversarialAgent not implemented — Sprint 18');
  }

  stop(): void {
    // No-op until implemented
  }

  getStatus(): 'idle' | 'running' | 'stopped' {
    return 'idle';
  }
}
