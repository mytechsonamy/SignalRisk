/**
 * FraudTester — MockAdapter Unit Tests
 *
 * 4 tests covering:
 *   1. always-block: all events return BLOCK
 *   2. always-allow: all events return ALLOW
 *   3. threshold:    riskScore 0.9 → BLOCK, 0.5 → REVIEW, 0.2 → ALLOW
 *   4. custom:       customFn provides full control over the decision
 */

import { MockAdapter } from '../adapters/mock.adapter';
import type { FraudTestEvent } from '../adapters/base.adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(id: string): FraudTestEvent {
  return {
    eventId: id,
    merchantId: 'merchant-test-001',
    deviceFingerprint: `fp-${id}`,
    userId: `user-${id}`,
    ipAddress: '198.51.100.1',
    amount: 100,
    currency: 'USD',
    metadata: { test: true },
  };
}

// ---------------------------------------------------------------------------
// Test 1: always-block
// ---------------------------------------------------------------------------
describe('MockAdapter — always-block', () => {
  it('returns BLOCK for every submitted event', async () => {
    const adapter = new MockAdapter({ mode: 'always-block' });

    for (let i = 0; i < 5; i++) {
      const decision = await adapter.submitEvent(makeEvent(`evt-block-${i}`));
      expect(decision.decision).toBe('BLOCK');
    }
  });
});

// ---------------------------------------------------------------------------
// Test 2: always-allow
// ---------------------------------------------------------------------------
describe('MockAdapter — always-allow', () => {
  it('returns ALLOW for every submitted event', async () => {
    const adapter = new MockAdapter({ mode: 'always-allow' });

    for (let i = 0; i < 5; i++) {
      const decision = await adapter.submitEvent(makeEvent(`evt-allow-${i}`));
      expect(decision.decision).toBe('ALLOW');
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3: threshold
// ---------------------------------------------------------------------------
describe('MockAdapter — threshold', () => {
  it('maps riskScore correctly: 0.9 → BLOCK, 0.5 → REVIEW, 0.2 → ALLOW', async () => {
    const cases: Array<{ score: number; expected: 'ALLOW' | 'REVIEW' | 'BLOCK' }> = [
      { score: 0.9, expected: 'BLOCK' },
      { score: 0.5, expected: 'REVIEW' },
      { score: 0.2, expected: 'ALLOW' },
    ];

    for (const { score, expected } of cases) {
      const adapter = new MockAdapter({
        mode: 'threshold',
        fixedRiskScore: score,
      });
      const decision = await adapter.submitEvent(makeEvent(`evt-threshold-${score}`));
      expect(decision.decision).toBe(expected);
      expect(decision.riskScore).toBe(score);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 4: custom
// ---------------------------------------------------------------------------
describe('MockAdapter — custom', () => {
  it('delegates fully to customFn, allowing any decision and riskScore', async () => {
    const adapter = new MockAdapter({
      mode: 'custom',
      customFn: (event) => ({
        decision: 'REVIEW',
        riskScore: 0.77,
        signals: { device: 0.8, velocity: 0.6 },
      }),
    });

    const event = makeEvent('evt-custom-001');
    const decision = await adapter.submitEvent(event);

    expect(decision.eventId).toBe('evt-custom-001');
    expect(decision.decision).toBe('REVIEW');
    expect(decision.riskScore).toBe(0.77);
    expect(decision.signals).toEqual({ device: 0.8, velocity: 0.6 });
  });

  it('also stores the decision so getDecision returns it', async () => {
    const adapter = new MockAdapter({
      mode: 'custom',
      customFn: () => ({ decision: 'BLOCK', riskScore: 0.95 }),
    });

    const event = makeEvent('evt-custom-002');
    await adapter.submitEvent(event);

    const stored = await adapter.getDecision('evt-custom-002');
    expect(stored).not.toBeNull();
    expect(stored!.decision).toBe('BLOCK');
  });
});

// ---------------------------------------------------------------------------
// Extra: reset clears stored decisions
// ---------------------------------------------------------------------------
describe('MockAdapter — reset', () => {
  it('clears all stored decisions on reset()', async () => {
    const adapter = new MockAdapter({ mode: 'always-block' });

    await adapter.submitEvent(makeEvent('evt-reset-001'));
    expect(await adapter.getDecision('evt-reset-001')).not.toBeNull();

    await adapter.reset();
    expect(await adapter.getDecision('evt-reset-001')).toBeNull();
  });
});
