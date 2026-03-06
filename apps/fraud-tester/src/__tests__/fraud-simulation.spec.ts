/**
 * FraudTester — FraudSimulationAgent Unit Tests  (T12)
 *
 * 8 test cases covering:
 *   1. All 5 default scenarios are run
 *   2. 'result' events are emitted for each attack
 *   3. High detection rate when adapter always BLOCKs
 *   4. device-farm scenario fails when adapter always ALLOWs
 *   5. Continues after single scenario failures (adapter throws)
 *   6. Same seed produces same event sequence (deterministic generator)
 *   7. getStatus() reflects lifecycle correctly
 *   8. DetectionReporter FPR/TPR for mixed results
 */

import { FraudSimulationAgent } from '../agents/fraud-simulation.agent';
import { DetectionReporter } from '../reporter/detection-reporter';
import type { IFraudSystemAdapter, FraudDecision } from '../adapters/base.adapter';
import type { AttackResult } from '../scenarios/types';
import { deviceFarmScenario, SHARED_FINGERPRINT } from '../scenarios/catalog/device-farm.scenario';

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(decisionOverride: Partial<FraudDecision> = {}): IFraudSystemAdapter {
  return {
    name: 'MockAdapter',
    async submitEvent(event) {
      return {
        eventId: event.eventId,
        decision: 'BLOCK',
        riskScore: 0.9,
        latencyMs: 50,
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

describe('FraudSimulationAgent', () => {
  // Test 1: All 5 default scenarios run
  test('runs all 5 default scenarios', async () => {
    const agent = new FraudSimulationAgent();
    const adapter = createMockAdapter();
    const report = await agent.run(adapter);

    expect(report.scenarios).toHaveLength(5);
    const ids = report.scenarios.map((s) => s.scenarioId);
    expect(ids).toContain('device-farm');
    expect(ids).toContain('bot-checkout');
    expect(ids).toContain('velocity-evasion');
    expect(ids).toContain('emulator-spoof');
    expect(ids).toContain('sim-swap');
  });

  // Test 2: 'result' events emitted for each attack
  test('emits result event for each attack', async () => {
    const agent = new FraudSimulationAgent();
    const adapter = createMockAdapter();
    const results: unknown[] = [];

    agent.on('result', (r) => results.push(r));
    await agent.run(adapter);

    // 5 scenarios × 50 events each = 250 results
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBe(250);
  });

  // Test 3: High detection rate when all BLOCKed
  test('calculates detection rate correctly when all blocked', async () => {
    const agent = new FraudSimulationAgent();
    const adapter = createMockAdapter({ decision: 'BLOCK', riskScore: 0.95 });
    const report = await agent.run(adapter);

    // Every event blocked → TPR = 1.0 for all scenarios
    expect(report.overallTpr).toBeGreaterThan(0.8);
    for (const scenario of report.scenarios) {
      expect(scenario.detectionRate).toBeCloseTo(1.0, 1);
    }
  });

  // Test 4: device-farm scenario fails when adapter always ALLOWs
  test('detects zero detection rate when all ALLOW', async () => {
    const agent = new FraudSimulationAgent();
    const adapter = createMockAdapter({ decision: 'ALLOW', riskScore: 0.1 });
    const report = await agent.run(adapter);

    // Device farm expects BLOCK — ALLOWing everything means 0 detections
    const deviceFarmResult = report.scenarios.find((s) => s.scenarioId === 'device-farm');
    expect(deviceFarmResult).toBeDefined();
    expect(deviceFarmResult!.detectionRate).toBeCloseTo(0, 5);
    expect(deviceFarmResult!.passed).toBe(false);
  });

  // Test 5: Continues after single scenario failure (adapter throws on first N calls)
  test('continues after single scenario failure (adapter throws)', async () => {
    let callCount = 0;
    const flakyAdapter: IFraudSystemAdapter = {
      name: 'FlakyAdapter',
      async submitEvent(event) {
        callCount++;
        // First 50 calls (all of device-farm) throw
        if (callCount <= 50) throw new Error('Network error');
        return { eventId: event.eventId, decision: 'BLOCK', riskScore: 0.9, latencyMs: 10 };
      },
      async getDecision() {
        return null;
      },
      async reset() {},
      async healthCheck() {
        return true;
      },
    };

    const agent = new FraudSimulationAgent();
    const report = await agent.run(flakyAdapter);

    // All 5 scenario results are present (device-farm has 0 events due to errors,
    // remaining 4 scenarios succeed)
    expect(report.scenarios).toHaveLength(5);
    const deviceFarmResult = report.scenarios.find((s) => s.scenarioId === 'device-farm');
    expect(deviceFarmResult!.totalEvents).toBe(0); // all errored
    const botResult = report.scenarios.find((s) => s.scenarioId === 'bot-checkout');
    expect(botResult!.totalEvents).toBeGreaterThan(0);
  });

  // Test 6: Same seed produces same event sequence (deterministic)
  test('same seed produces same event sequence', async () => {
    const gen1 = deviceFarmScenario.generate(42);
    const gen2 = deviceFarmScenario.generate(42);

    const first1 = await gen1.next();
    const first2 = await gen2.next();

    expect(first1.value).toBeDefined();
    expect(first2.value).toBeDefined();
    expect(first1.value!.eventId).toBe(first2.value!.eventId);
    expect(first1.value!.deviceFingerprint).toBe(SHARED_FINGERPRINT);
    expect(first2.value!.deviceFingerprint).toBe(SHARED_FINGERPRINT);
  });

  // Test 7: getStatus() lifecycle
  test('getStatus returns running during execution, idle after', async () => {
    const agent = new FraudSimulationAgent();
    const adapter = createMockAdapter();

    const runPromise = agent.run(adapter);
    // Immediately after calling run(), status should be 'running'
    expect(agent.getStatus()).toBe('running');

    await runPromise;
    expect(agent.getStatus()).toBe('idle');
  });

  // Test 8: DetectionReporter TPR/FPR for mixed results
  test('DetectionReporter computes correct TPR and FPR for mixed results', () => {
    const reporter = new DetectionReporter();

    // 8 TP (BLOCK), 2 FN (ALLOW expected BLOCK but got ALLOW) → TPR = 8/10 = 0.8
    const makeResult = (systemDecision: 'ALLOW' | 'BLOCK'): AttackResult => ({
      event: {
        eventId: 'evt-x',
        merchantId: 'merchant-001',
        deviceFingerprint: SHARED_FINGERPRINT,
        userId: 'user-1',
        metadata: {},
      },
      decision: {
        eventId: 'evt-x',
        decision: systemDecision,
        riskScore: systemDecision === 'BLOCK' ? 0.9 : 0.1,
        latencyMs: 30,
      },
      detected: systemDecision === 'BLOCK',
    });

    const results: AttackResult[] = [
      ...Array.from({ length: 8 }, () => makeResult('BLOCK')), // 8 TP
      ...Array.from({ length: 2 }, () => makeResult('ALLOW')), // 2 FN
    ];

    const scenarioResult = reporter.compute(results, deviceFarmScenario);

    expect(scenarioResult.tp).toBe(8);
    expect(scenarioResult.fn).toBe(2);
    expect(scenarioResult.fp).toBe(0);
    expect(scenarioResult.tn).toBe(0);
    expect(scenarioResult.detectionRate).toBeCloseTo(0.8, 5);

    // BattleReport aggregation
    const battleReport = reporter.computeBattleReport([scenarioResult], 'MockAdapter');
    expect(battleReport.overallTpr).toBeCloseTo(0.8, 5);
    // FPR = fp / (fp + tn) = 0 / 0 → 0 (no negatives in device-farm)
    expect(battleReport.overallFpr).toBeCloseTo(0, 5);
    expect(battleReport.targetAdapter).toBe('MockAdapter');
    expect(battleReport.scenarios).toHaveLength(1);
  });
});
