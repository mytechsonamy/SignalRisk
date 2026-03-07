/**
 * Scenario: Device Farm Attack
 *
 * Simulates a fraud ring that reuses a single device fingerprint across many
 * different user accounts — a classic device-farm / account-takeover pattern.
 *
 * Expected behaviour: the decision engine should recognise repeated fingerprint
 * reuse and escalate to BLOCK with a high risk score.
 */

import type { FraudTestEvent } from '../types';
import type { FraudScenario } from '../types';

const TOTAL_EVENTS = 50;
export const SHARED_FINGERPRINT = 'farm-device-abc123';

export const deviceFarmScenario: FraudScenario = {
  id: 'device-farm',
  name: 'Device Farm Attack',
  description:
    'A single device fingerprint is shared across 50 different user accounts, ' +
    'mimicking a fraud ring or device-farm operation.',
  category: 'device',
  expectedOutcome: {
    minRiskScore: 0.75,
    decision: 'BLOCK',
    minDetectionRate: 0.8,
  },

  async *generate(seed = 0): AsyncGenerator<FraudTestEvent> {
    for (let i = 0; i < TOTAL_EVENTS; i++) {
      const event: FraudTestEvent = {
        eventId: `evt-farm-${seed}-${i}`,
        merchantId: '00000000-0000-0000-0000-000000000001',
        deviceFingerprint: SHARED_FINGERPRINT,
        userId: `user-${i}`,
        amount: 100 + (i % 400),
        currency: 'USD',
        metadata: {
          scenarioId: 'device-farm',
          eventIndex: i,
          userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36',
        },
      };

      yield event;
    }
  },
};
