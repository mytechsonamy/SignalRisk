/**
 * Scenario: Velocity Evasion Attack
 *
 * Simulates a fraud ring that rotates user IDs and device fingerprints
 * to stay below per-user velocity thresholds while collectively exceeding
 * acceptable transaction volume from a single IP subnet.
 *
 * Expected behaviour: the network-level velocity signals should aggregate
 * the suspicious pattern and trigger a REVIEW or BLOCK verdict.
 */

import type { FraudTestEvent } from '../types';
import type { FraudScenario } from '../types';

const TOTAL_EVENTS = 50;
const IP_SUBNET = '192.168.77';

export const velocityEvasionScenario: FraudScenario = {
  id: 'velocity-evasion',
  name: 'Velocity Evasion Attack',
  description:
    'Fraud ring rotates user IDs and device fingerprints across 50 events ' +
    'while sharing an IP /24 subnet, evading per-user velocity rules.',
  category: 'velocity',
  expectedOutcome: {
    minRiskScore: 0.65,
    decision: 'REVIEW',
    minDetectionRate: 0.70,
  },

  async *generate(seed = 0): AsyncGenerator<FraudTestEvent> {
    for (let i = 0; i < TOTAL_EVENTS; i++) {
      const hostOctet = (seed * 7 + i * 3) % 254 + 1;

      const event: FraudTestEvent = {
        eventId: `evt-vel-evasion-${seed}-${i}`,
        merchantId: 'merchant-test-001',
        deviceFingerprint: `vel-device-${seed}-${i % 10}`,
        userId: `vel-user-${seed}-${i % 10}`,
        ipAddress: `${IP_SUBNET}.${hostOctet}`,
        amount: 200 + (i % 300),
        currency: 'USD',
        metadata: {
          scenarioId: 'velocity-evasion',
          eventIndex: i,
          rotationGroup: i % 10,
          subnetPrefix: IP_SUBNET,
        },
      };

      yield event;
    }
  },
};
