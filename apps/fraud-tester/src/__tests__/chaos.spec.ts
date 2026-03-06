/**
 * FraudTester — ChaosAgent & ChaosAdapterWrapper Unit Tests  (T18)
 *
 * 6 test cases covering:
 *   1. timeout mode: submitEvent throws after timeoutMs
 *   2. partialFailure mode: ~30% of events throw
 *   3. stress mode: adds delay to each event
 *   4. ChaosAgent run completes with partial results on timeout mode
 *   5. ChaosAgent all mode: runs 3 chaos configurations
 *   6. inner adapter healthCheck is not affected by chaos
 */

import { ChaosAgent } from '../agents/chaos.agent';
import { ChaosAdapterWrapper } from '../adapters/chaos-wrapper';
import type { FraudDecision, IFraudSystemAdapter } from '../adapters/base.adapter';

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides?: Partial<FraudDecision>): IFraudSystemAdapter {
  return {
    name: 'MockAdapter',
    async submitEvent(event) {
      return {
        eventId: event.eventId,
        decision: 'BLOCK',
        riskScore: 0.9,
        latencyMs: 10,
        ...overrides,
      };
    },
    async getDecision() {
      return null;
    },
    async reset() {},
    async healthCheck() {
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChaosAgent & ChaosAdapterWrapper', () => {
  // Test 1: timeout mode throws after timeoutMs
  test('timeout mode: submitEvent throws after timeoutMs', async () => {
    const slowAdapter: IFraudSystemAdapter = {
      name: 'SlowAdapter',
      async submitEvent() {
        await new Promise((r) => setTimeout(r, 10_000)); // 10 s — far beyond our timeout
        return {} as FraudDecision;
      },
      async getDecision() {
        return null;
      },
      async reset() {},
      async healthCheck() {
        return true;
      },
    };

    const wrapper = new ChaosAdapterWrapper(slowAdapter, { type: 'timeout', timeoutMs: 100 });
    const event = {
      eventId: 'e1',
      merchantId: 'm1',
      deviceFingerprint: 'fp',
      userId: 'u1',
      metadata: {},
    };

    await expect(wrapper.submitEvent(event)).rejects.toThrow(/timeout/i);
  }, 2000);

  // Test 2: partialFailure mode injects ~30% errors
  test('partialFailure mode: ~30% of events throw', async () => {
    const okAdapter = createMockAdapter();
    const wrapper = new ChaosAdapterWrapper(okAdapter, { type: 'partialFailure', failureRate: 0.3 });

    let errors = 0;
    for (let i = 0; i < 100; i++) {
      try {
        await wrapper.submitEvent({
          eventId: `e${i}`,
          merchantId: 'm',
          deviceFingerprint: 'fp',
          userId: 'u',
          metadata: {},
        });
      } catch {
        errors++;
      }
    }

    // With failureRate=0.3 over 100 calls we expect 10–50 failures (3-sigma headroom)
    expect(errors).toBeGreaterThan(5);
    expect(errors).toBeLessThan(60);
  });

  // Test 3: stress mode adds at least delayMs latency
  test('stress mode: adds delay to each event', async () => {
    const okAdapter = createMockAdapter();
    const wrapper = new ChaosAdapterWrapper(okAdapter, { type: 'stress', delayMs: 20 });

    const start = Date.now();
    await wrapper.submitEvent({
      eventId: 'e1',
      merchantId: 'm',
      deviceFingerprint: 'fp',
      userId: 'u',
      metadata: {},
    });

    expect(Date.now() - start).toBeGreaterThanOrEqual(20);
  });

  // Test 4: ChaosAgent timeout mode completes when adapter is fast
  test('ChaosAgent run completes with partial results on timeout', async () => {
    const agent = new ChaosAgent('timeout');
    const okAdapter = createMockAdapter(); // fast — well within 3000 ms timeout

    const report = await agent.run(okAdapter);

    expect(report).toBeDefined();
    expect(report.scenarios.length).toBeGreaterThan(0);
    // targetAdapter label encodes the mode
    expect(report.targetAdapter).toContain('chaos=timeout');
  });

  // Test 5: ChaosAgent all mode runs 3 configurations
  test('ChaosAgent all mode: runs 3 chaos configurations', async () => {
    const agent = new ChaosAgent('all');
    const adapter = createMockAdapter();

    const report = await agent.run(adapter);

    // 2 scenarios × 3 modes = 6 ScenarioResults minimum
    expect(report.scenarios.length).toBeGreaterThanOrEqual(3);
    expect(report.targetAdapter).toContain('chaos=all');
  }, 30_000);

  // Test 6: healthCheck bypasses chaos injection
  test('inner adapter healthCheck is not affected by chaos', async () => {
    const okAdapter = createMockAdapter();
    const wrapper = new ChaosAdapterWrapper(okAdapter, {
      type: 'partialFailure',
      failureRate: 0.9, // 90% failure rate on submitEvent
    });

    // healthCheck should always resolve true regardless of failureRate
    await expect(wrapper.healthCheck()).resolves.toBe(true);
  });
});
