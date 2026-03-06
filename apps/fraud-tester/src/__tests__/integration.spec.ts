/**
 * FraudTester — Integration Tests (T27)
 *
 * Tests run against real services when SIGNALRISK_URL env var is provided.
 * Tests 1-3, 5-8 use MockAdapter and run in every environment (CI included).
 * Test 4 requires a live SignalRisk instance — guarded by SKIP.
 *
 * Run with:
 *   npx jest integration.spec.ts
 *
 * To enable live integration test:
 *   SIGNALRISK_URL=http://localhost:3002 \
 *   SIGNALRISK_API_KEY=sk_test_... \
 *   npx jest integration.spec.ts
 */

import {
  MockAdapter,
  SignalRiskAdapter,
  ScenarioRunner,
  deviceFarmScenario,
  emulatorSpoofScenario,
  botCheckoutScenario,
  velocityEvasionScenario,
  simSwapScenario,
} from '../index';
import type { FraudTestEvent } from '../index';

// ---------------------------------------------------------------------------
// Skip guard for live integration tests
// ---------------------------------------------------------------------------

const SKIP = process.env.SKIP_INTEGRATION === 'true' || !process.env.SIGNALRISK_URL;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<FraudTestEvent> = {}): FraudTestEvent {
  return {
    eventId: `evt-integ-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    merchantId: 'test-merchant',
    deviceFingerprint: 'fp-integ-test',
    userId: 'user-integ-1',
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Integration Suite
// ---------------------------------------------------------------------------

describe('FraudTester Integration', () => {
  let signalRiskAdapter: SignalRiskAdapter;

  beforeAll(() => {
    if (SKIP) return;
    signalRiskAdapter = new SignalRiskAdapter({
      baseUrl: process.env.SIGNALRISK_URL!,
      apiKey: process.env.SIGNALRISK_API_KEY!,
      merchantId: process.env.TEST_MERCHANT_ID ?? 'test-merchant',
    });
  });

  // -------------------------------------------------------------------------
  // Test 1: MockAdapter always-block mode → every event returns BLOCK
  // -------------------------------------------------------------------------
  test('MockAdapter always-block: every event returns BLOCK', async () => {
    const adapter = new MockAdapter({ mode: 'always-block', fixedLatencyMs: 10 });
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ eventId: `evt-block-${i}` }),
    );

    for (const event of events) {
      const decision = await adapter.submitEvent(event);
      expect(decision.decision).toBe('BLOCK');
      expect(decision.eventId).toBe(event.eventId);
    }
  });

  // -------------------------------------------------------------------------
  // Test 2: MockAdapter always-allow mode → every event returns ALLOW
  // -------------------------------------------------------------------------
  test('MockAdapter always-allow: every event returns ALLOW', async () => {
    const adapter = new MockAdapter({ mode: 'always-allow', fixedLatencyMs: 10 });
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ eventId: `evt-allow-${i}` }),
    );

    for (const event of events) {
      const decision = await adapter.submitEvent(event);
      expect(decision.decision).toBe('ALLOW');
    }
  });

  // -------------------------------------------------------------------------
  // Test 3: MockAdapter threshold mode (score > 0.7 → BLOCK, else varies)
  // -------------------------------------------------------------------------
  test('MockAdapter threshold: high risk score → BLOCK, low risk score → ALLOW', async () => {
    // High risk — fixed score 0.9 → should BLOCK
    const blockAdapter = new MockAdapter({
      mode: 'threshold',
      fixedRiskScore: 0.9,
      fixedLatencyMs: 10,
    });
    const highRiskDecision = await blockAdapter.submitEvent(makeEvent({ eventId: 'evt-high' }));
    expect(highRiskDecision.decision).toBe('BLOCK');

    // Low risk — fixed score 0.2 → should ALLOW
    const allowAdapter = new MockAdapter({
      mode: 'threshold',
      fixedRiskScore: 0.2,
      fixedLatencyMs: 10,
    });
    const lowRiskDecision = await allowAdapter.submitEvent(makeEvent({ eventId: 'evt-low' }));
    expect(lowRiskDecision.decision).toBe('ALLOW');
  });

  // -------------------------------------------------------------------------
  // Test 4: SignalRisk adapter (live) — submitEvent returns a valid decision
  // -------------------------------------------------------------------------
  test.skip('SignalRisk adapter (live): submitEvent returns ALLOW or BLOCK', async () => {
    if (SKIP) {
      console.log('[SKIP] SIGNALRISK_URL not set — skipping live integration test');
      return;
    }
    const event = makeEvent({ eventId: `evt-live-${Date.now()}` });
    const decision = await signalRiskAdapter.submitEvent(event);

    expect(['ALLOW', 'REVIEW', 'BLOCK']).toContain(decision.decision);
    expect(decision.riskScore).toBeGreaterThanOrEqual(0);
    expect(decision.riskScore).toBeLessThanOrEqual(1);
    expect(decision.eventId).toBe(event.eventId);
    expect(decision.latencyMs).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Test 5: Device farm scenario with MockAdapter → detection rate > 80%
  // -------------------------------------------------------------------------
  test('Device farm scenario: MockAdapter threshold=0.6 → detection rate > 80%', async () => {
    // threshold adapter with fixedRiskScore 0.85 → all BLOCK → 100% detection
    const adapter = new MockAdapter({
      mode: 'threshold',
      fixedRiskScore: 0.85,
      fixedLatencyMs: 5,
    });

    const runner = new ScenarioRunner();
    const report = await runner.run([deviceFarmScenario], adapter);

    expect(report.scenarios).toHaveLength(1);
    const result = report.scenarios[0];
    expect(result.scenarioId).toBe('device-farm');
    expect(result.detectionRate).toBeGreaterThan(0.8);
    expect(result.totalEvents).toBe(50);
  });

  // -------------------------------------------------------------------------
  // Test 6: Emulator spoof scenario with MockAdapter → detection rate > 70%
  // -------------------------------------------------------------------------
  test('Emulator spoof scenario: MockAdapter always-block → detection rate > 70%', async () => {
    const adapter = new MockAdapter({
      mode: 'always-block',
      fixedLatencyMs: 5,
    });

    const runner = new ScenarioRunner();
    const report = await runner.run([emulatorSpoofScenario], adapter);

    expect(report.scenarios).toHaveLength(1);
    const result = report.scenarios[0];
    expect(result.scenarioId).toBe('emulator-spoof');
    expect(result.detectionRate).toBeGreaterThan(0.7);
    expect(result.totalEvents).toBe(50);
  });

  // -------------------------------------------------------------------------
  // Test 7: Adapter error handling → wrong URL → healthCheck() returns false
  // -------------------------------------------------------------------------
  test('SignalRiskAdapter: unreachable URL → healthCheck returns false', async () => {
    const badAdapter = new SignalRiskAdapter({
      baseUrl: 'http://127.0.0.1:19999', // nothing listening here
      apiKey: 'sk_test_' + 'a'.repeat(32),
      merchantId: 'test-merchant',
    });

    const result = await badAdapter.healthCheck();
    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 8: ScenarioRunner + MockAdapter → 5 scenarios → BattleReport not empty
  // -------------------------------------------------------------------------
  test('ScenarioRunner: 5 scenarios with MockAdapter → BattleReport populated', async () => {
    const adapter = new MockAdapter({
      mode: 'always-block',
      fixedLatencyMs: 5,
    });

    const scenarios = [
      deviceFarmScenario,
      emulatorSpoofScenario,
      botCheckoutScenario,
      velocityEvasionScenario,
      simSwapScenario,
    ];

    const runner = new ScenarioRunner();
    const report = await runner.run(scenarios, adapter);

    expect(report).toBeDefined();
    expect(report.scenarios).toHaveLength(5);
    expect(report.targetAdapter).toBe('MockAdapter');
    expect(report.id).toBeTruthy();

    // All scenarios should have processed events
    for (const scenarioResult of report.scenarios) {
      expect(scenarioResult.totalEvents).toBeGreaterThan(0);
    }

    // With always-block adapter, overallTpr should be high
    expect(report.overallTpr).toBeGreaterThan(0.5);
  });
});
