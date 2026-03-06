/**
 * Scenario: SIM Swap Attack
 *
 * Simulates identity fraud where an attacker has taken over a victim's
 * phone number via a SIM swap at the carrier. Post-swap, the attacker's
 * device profile diverges sharply from the victim's history: new device
 * fingerprint, different IP, inconsistent carrier details.
 *
 * Expected behaviour: the telco intelligence and behavioral services should
 * flag the sudden device/carrier change and escalate to REVIEW or BLOCK.
 */

import type { FraudTestEvent } from '../types';
import type { FraudScenario } from '../types';

const TOTAL_EVENTS = 50;

export const simSwapScenario: FraudScenario = {
  id: 'sim-swap',
  name: 'SIM Swap Attack',
  description:
    '50 post-SIM-swap transactions: attacker device diverges from victim ' +
    'history — new fingerprint, changed carrier, sudden high-value purchases.',
  category: 'identity',
  expectedOutcome: {
    minRiskScore: 0.70,
    decision: 'REVIEW',
    minDetectionRate: 0.75,
  },

  async *generate(seed = 0): AsyncGenerator<FraudTestEvent> {
    const victimPhone = `+1555${String(seed).padStart(7, '0')}`;

    for (let i = 0; i < TOTAL_EVENTS; i++) {
      const event: FraudTestEvent = {
        eventId: `evt-sim-swap-${seed}-${i}`,
        merchantId: 'merchant-test-001',
        // Each event uses the attacker's device, not the victim's historical device
        deviceFingerprint: `attacker-device-${seed}`,
        userId: `victim-user-${seed}`,
        ipAddress: `203.0.113.${(seed * 3 + i) % 254 + 1}`,
        amount: 500 + (i % 1500),
        currency: 'USD',
        metadata: {
          scenarioId: 'sim-swap',
          eventIndex: i,
          phoneNumber: victimPhone,
          carrierName: 'AttackerCarrier',
          // Victim's historical carrier is 'VerizonWireless' — mismatch is deliberate
          historicalCarrier: 'VerizonWireless',
          simChangeDetected: true,
          daysSinceSimChange: 0,
          newDeviceSinceSimChange: true,
        },
      };

      yield event;
    }
  },
};
