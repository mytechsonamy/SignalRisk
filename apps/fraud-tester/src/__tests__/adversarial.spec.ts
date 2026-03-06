/**
 * FraudTester — AdversarialAgent Unit Tests (T17)
 *
 * 6 test cases covering:
 *   1. All 3 adversarial scenarios run by default ('all' pattern)
 *   2. Only emulator-bypass when pattern is specified
 *   3. adversarialSuccess=false when system detects (BLOCKs) all attacks
 *   4. emulator-bypass generates realistic device metadata (no SwiftShader)
 *   5. slow-fraud timestamps span at least 6 hours
 *   6. stop() halts execution mid-run
 */

import { AdversarialAgent } from '../agents/adversarial.agent';
import type { IFraudSystemAdapter, FraudDecision } from '../adapters/base.adapter';
import { emulatorBypassScenario } from '../scenarios/catalog/adversarial/emulator-bypass.scenario';
import { slowFraudScenario } from '../scenarios/catalog/adversarial/slow-fraud.scenario';

// ---------------------------------------------------------------------------
// Mock adapter factory (mirrors fraud-simulation.spec.ts helper)
// ---------------------------------------------------------------------------

function createMockAdapter(decisionOverride: Partial<FraudDecision> = {}): IFraudSystemAdapter {
  return {
    name: 'MockAdapter',
    async submitEvent(event) {
      return {
        eventId: event.eventId,
        decision: 'BLOCK' as const,
        riskScore: 0.9,
        latencyMs: 10,
        ...decisionOverride,
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

describe('AdversarialAgent', () => {
  // Test 1: all 3 adversarial scenarios run by default
  test('runs all 3 adversarial scenarios by default', async () => {
    const agent = new AdversarialAgent('all');
    const adapter = createMockAdapter({ decision: 'ALLOW', riskScore: 0.1 });
    const report = await agent.run(adapter);

    expect(report.scenarios).toHaveLength(3);
    expect(report.adversarialSuccess).toBe(true); // system let everything through
    expect(report.agentName).toBe('AdversarialAgent');
  });

  // Test 2: only emulator-bypass when pattern is specified
  test('runs only emulator-bypass when pattern specified', async () => {
    const agent = new AdversarialAgent('emulator-bypass');
    const adapter = createMockAdapter({ decision: 'ALLOW', riskScore: 0.15 });
    const report = await agent.run(adapter);

    expect(report.scenarios).toHaveLength(1);
    expect(report.scenarios[0].scenarioId).toBe('adversarial-emulator-bypass');
  });

  // Test 3: adversarialSuccess=false when system detects (BLOCKs) all attacks
  test('adversarialSuccess=false when system detects all attacks', async () => {
    const agent = new AdversarialAgent('all');
    const adapter = createMockAdapter({ decision: 'BLOCK', riskScore: 0.92 });
    const report = await agent.run(adapter);

    expect(report.adversarialSuccess).toBe(false); // system caught everything
  });

  // Test 4: emulator-bypass generates realistic device metadata
  test('emulator-bypass generates realistic device metadata', async () => {
    const scenario = emulatorBypassScenario;
    const gen = scenario.generate(1);
    const { value: event } = await gen.next();

    expect(event).toBeDefined();
    expect(event!.metadata).toHaveProperty('gpu_renderer');
    // Should NOT use known emulator renderer strings
    expect(event!.metadata.gpu_renderer).not.toContain('SwiftShader');
    expect(event!.metadata.gpu_renderer).not.toContain('Android Emulator');
    expect(event!.metadata).toHaveProperty('thermal_state');
    expect(event!.metadata).toHaveProperty('sensor_noise');
    expect(event!.metadata).toHaveProperty('battery_level');
    expect(event!.metadata.adbEnabled).toBe(false);
  });

  // Test 5: slow-fraud timestamps span at least 6 hours
  test('slow-fraud timestamps span at least 6 hours', async () => {
    const scenario = slowFraudScenario;
    const events: import('../scenarios/types').FraudTestEvent[] = [];

    for await (const event of scenario.generate(42)) {
      events.push(event);
    }

    expect(events).toHaveLength(24);

    const timestamps = events.map((e) =>
      new Date(e.metadata.timestamp as string).getTime(),
    );
    const span = Math.max(...timestamps) - Math.min(...timestamps);

    // 12-hour window → must be at least 6 hours (6 * 60 * 60 * 1000 ms)
    expect(span).toBeGreaterThanOrEqual(6 * 60 * 60 * 1000);
  });

  // Test 6: stop() halts execution mid-run
  test('stop() halts execution mid-run', async () => {
    const agent = new AdversarialAgent('all');
    let resolveCount = 0;

    // Each submitEvent yields to the event loop via a microtask delay,
    // giving stop() a chance to set _stopped before all 74 events complete.
    const slowAdapter: IFraudSystemAdapter = {
      name: 'SlowMockAdapter',
      async submitEvent(event) {
        // Tiny async gap so the event loop can process the setTimeout callback
        await new Promise((r) => setImmediate(r));
        return {
          eventId: event.eventId,
          decision: 'ALLOW' as const,
          riskScore: 0.1,
          latencyMs: 1,
        };
      },
      async getDecision() { return null; },
      async reset() {},
      async healthCheck() { return true; },
    };

    // stop() after first event loop turn — fires before all 74 events resolve
    setImmediate(() => agent.stop());
    agent.on('result', () => resolveCount++);

    // run() may resolve early after stop() — either is acceptable
    await agent.run(slowAdapter).catch(() => {});

    // Fewer than the full 74 events (30+24+20) should have been processed
    expect(resolveCount).toBeLessThan(74);
  });
});
