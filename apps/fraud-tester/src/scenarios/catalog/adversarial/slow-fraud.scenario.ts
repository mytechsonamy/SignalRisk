/**
 * Scenario: Adversarial Slow Fraud (Velocity Bypass)
 *
 * Attempts to evade velocity-based detection by spreading 24 fraudulent
 * transactions across a 12-hour window. Each event carries a metadata
 * timestamp that places it at a distinct hour, making the burst appear
 * as low-frequency background noise to sliding-window velocity detectors.
 *
 * Adversarial expectation: velocity detection should mis-classify most
 * events as benign due to the artificially low per-window count.
 */

import type { FraudTestEvent, FraudScenario } from '../../types';

const TOTAL_EVENTS = 24;

/** Spread events over 12 hours: one per 30-minute slot. */
function buildTimestamp(baseMs: number, eventIndex: number): string {
  // 12 hours = 43_200_000 ms; each of the 24 events is 30 min apart
  const offsetMs = eventIndex * 30 * 60 * 1000;
  return new Date(baseMs - (43_200_000 - offsetMs)).toISOString();
}

export const slowFraudScenario: FraudScenario = {
  id: 'adversarial-slow-fraud',
  name: 'Adversarial Slow Fraud (Velocity Bypass)',
  description:
    '24 fraudulent transactions whose metadata timestamps are spread across 12 hours ' +
    '(one every 30 minutes) to stay under per-window velocity thresholds. ' +
    'Aims to evade burst and rate-based detection.',
  category: 'velocity',
  expectedOutcome: {
    minRiskScore: 0.3,
    decision: 'REVIEW',
    minDetectionRate: 0.3,
  },

  async *generate(seed = 0): AsyncGenerator<FraudTestEvent> {
    // Anchor the 12-hour window to a fixed point derived from the seed so
    // runs are reproducible while still spanning a realistic time range.
    // Base: 2026-03-07T12:00:00Z (noon UTC) adjusted by seed offset.
    const BASE_MS = 1741348800000 + seed * 60_000;

    for (let i = 0; i < TOTAL_EVENTS; i++) {
      const timestamp = buildTimestamp(BASE_MS, i);

      // Use distinct user IDs to avoid simple entity-level velocity triggers,
      // but recycle card numbers to simulate a distributed carding ring.
      const cardSuffix = String(1000 + ((seed * 7 + i * 3) % 9000)).padStart(4, '0');

      const event: FraudTestEvent = {
        eventId: `evt-adversarial-slow-fraud-${seed}-${i}`,
        merchantId: '00000000-0000-0000-0000-000000000001',
        deviceFingerprint: `slow-fraud-fp-${seed}-${i % 8}`,
        userId: `slow-fraud-user-${seed}-${i}`,
        amount: 49 + ((seed * 11 + i * 7) % 200),
        currency: 'USD',
        metadata: {
          scenarioId: 'adversarial-slow-fraud',
          eventIndex: i,
          // Backdated / spread timestamp — the key evasion mechanism
          timestamp,
          card_last4: cardSuffix,
          // Low-frequency pattern signals: each event looks like a one-off
          session_duration_s: 180 + ((seed * 5 + i * 9) % 600),
          page_views: 3 + (i % 7),
          timezone_offset: -420 + (i % 14) * 60, // vary timezone to simulate distributed actors
        },
      };

      yield event;
    }
  },
};
