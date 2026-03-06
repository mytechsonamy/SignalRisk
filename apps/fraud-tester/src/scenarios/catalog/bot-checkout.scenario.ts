/**
 * Scenario: Bot Checkout Attack
 *
 * Simulates automated bot traffic performing rapid checkout sequences.
 * Bots are characterised by machine-perfect timing, identical user-agents,
 * and missing behavioural signals (no mouse movement, no scroll events).
 *
 * Expected behaviour: the decision engine should detect the absence of
 * human behavioural signals and escalate to BLOCK.
 */

import type { FraudTestEvent } from '../types';
import type { FraudScenario } from '../types';

const TOTAL_EVENTS = 50;

export const botCheckoutScenario: FraudScenario = {
  id: 'bot-checkout',
  name: 'Bot Checkout Attack',
  description:
    'Automated bot performs 50 rapid checkouts with machine-perfect timing, ' +
    'no mouse events, and a headless browser user-agent.',
  category: 'bot',
  expectedOutcome: {
    minRiskScore: 0.80,
    decision: 'BLOCK',
    minDetectionRate: 0.85,
  },

  async *generate(seed = 0): AsyncGenerator<FraudTestEvent> {
    for (let i = 0; i < TOTAL_EVENTS; i++) {
      const event: FraudTestEvent = {
        eventId: `evt-bot-checkout-${seed}-${i}`,
        merchantId: 'merchant-test-001',
        deviceFingerprint: `bot-device-${seed}`,
        userId: `bot-user-${seed}-${i}`,
        amount: 99.99,
        currency: 'USD',
        metadata: {
          scenarioId: 'bot-checkout',
          eventIndex: i,
          userAgent: 'HeadlessChrome/120.0.0.0',
          mouseEvents: 0,
          scrollEvents: 0,
          keystrokeIntervalMs: 0,
          sessionDurationMs: 150 + (i % 50),
          webdriver: true,
        },
      };

      yield event;
    }
  },
};
