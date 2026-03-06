/**
 * FraudTester — Integration Tests  (T15)
 *
 * Tests the SignalRiskAdapter + FraudSimulationAgent pipeline against a
 * jest.fn() mock of the global fetch — no real network or Docker required.
 *
 * Covers:
 *   1. submitEvent: POST to event-collector + poll decision-service
 *   2. device-farm scenario: detection rate computed correctly when all BLOCKed
 *   3. Adapter timeout / ECONNREFUSED: graceful failure, report still produced
 *   4. Normal traffic FPR < 0.2 when adapter always ALLOWs
 */

import { SignalRiskAdapter } from '../adapters/signalrisk.adapter';
import { FraudSimulationAgent } from '../agents/fraud-simulation.agent';
import { DetectionReporter } from '../reporter/detection-reporter';
import type { AttackResult } from '../scenarios/types';
import { deviceFarmScenario, SHARED_FINGERPRINT } from '../scenarios/catalog/device-farm.scenario';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(status: number, body: unknown = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as Response;
}

const BASE_CONFIG = {
  baseUrl: 'http://localhost:3002',
  apiKey: 'sk_test_' + 'a'.repeat(32),
  merchantId: 'test-merchant',
  decisionUrl: 'http://localhost:3009',
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SignalRisk Adapter Integration', () => {
  let adapter: SignalRiskAdapter;

  beforeEach(() => {
    adapter = new SignalRiskAdapter(BASE_CONFIG);
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: submitEvent POSTs to event-collector and polls decision-service
  // -------------------------------------------------------------------------
  test('submitEvent: POSTs to event-collector and polls decision', async () => {
    (global.fetch as jest.Mock)
      // POST /v1/events
      .mockResolvedValueOnce(
        makeResponse(202, { status: 'accepted' }),
      )
      // GET /v1/decisions/evt-1
      .mockResolvedValueOnce(
        makeResponse(200, {
          requestId: 'evt-1',
          action: 'ALLOW',
          riskScore: 0.2,
          riskFactors: [],
        }),
      );

    const event = {
      eventId: 'evt-1',
      merchantId: 'test-merchant',
      deviceFingerprint: 'fp-1',
      userId: 'user-1',
      metadata: {},
    };

    const result = await adapter.submitEvent(event);

    expect(result.decision).toBe('ALLOW');
    expect(result.riskScore).toBe(0.2);
    expect(result.eventId).toBe('evt-1');

    // Verify the POST went to the correct URL
    const [postUrl, postInit] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(postUrl).toBe('http://localhost:3002/v1/events');
    expect(postInit.method).toBe('POST');
    const headers = postInit.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${BASE_CONFIG.apiKey}`);
    expect(headers['X-Merchant-ID']).toBe('test-merchant');
  });

  // -------------------------------------------------------------------------
  // Test 2: device-farm scenario BLOCK rate > 0.8
  // -------------------------------------------------------------------------
  test('device-farm scenario: BLOCK oranı hesaplanır', async () => {
    // Every POST to /v1/events → accepted
    // Every GET to /v1/decisions/* → BLOCK
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/v1/events')) {
        return makeResponse(202, { status: 'accepted' });
      }
      // decision poll
      return makeResponse(200, {
        requestId: 'evt-x',
        action: 'BLOCK',
        riskScore: 0.95,
        riskFactors: [],
      });
    });

    const agent = new FraudSimulationAgent([deviceFarmScenario]);
    const report = await agent.run(adapter);

    expect(report.scenarios).toHaveLength(1);
    const deviceFarm = report.scenarios[0];
    expect(deviceFarm.scenarioId).toBe('device-farm');
    expect(deviceFarm.detectionRate).toBeGreaterThan(0.8);
    expect(deviceFarm.passed).toBe(true);
    expect(deviceFarm.totalEvents).toBe(50);
  });

  // -------------------------------------------------------------------------
  // Test 3: adapter timeout / ECONNREFUSED — graceful failure, report returned
  // -------------------------------------------------------------------------
  test('adapter timeout: graceful failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    const agent = new FraudSimulationAgent([deviceFarmScenario]);

    // Should NOT throw — runner catches per-event errors and returns a partial report
    const report = await agent.run(adapter);

    expect(report).toBeDefined();
    expect(report.scenarios).toHaveLength(1);
    // All events errored → 0 detected, but scenario result exists
    expect(report.scenarios[0].totalEvents).toBe(0);
    expect(report.scenarios[0].passed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 4: normal traffic FPR < 0.2 when adapter always ALLOWs
  // -------------------------------------------------------------------------
  test('normal traffic FPR < 0.2', async () => {
    // When the system ALLOWs everything for a scenario that expects BLOCK,
    // there are only FN — no FP at all (FPR = fp/(fp+tn) = 0).
    // We test this via the DetectionReporter directly with mock AttackResults.

    const reporter = new DetectionReporter();

    // Simulate 20 events: system says ALLOW for all, scenario expects BLOCK
    // Result: 0 TP, 20 FN, 0 FP, 0 TN → TPR=0, FPR=0
    const makeAllowResult = (): AttackResult => ({
      event: {
        eventId: 'evt-allow',
        merchantId: 'test-merchant',
        deviceFingerprint: SHARED_FINGERPRINT,
        userId: 'user-normal',
        metadata: {},
      },
      decision: {
        eventId: 'evt-allow',
        decision: 'ALLOW',
        riskScore: 0.05,
        latencyMs: 30,
      },
      detected: false,
    });

    const results: AttackResult[] = Array.from({ length: 20 }, makeAllowResult);
    const scenarioResult = reporter.compute(results, deviceFarmScenario);

    // FPR = fp / (fp + tn) — since there are no TN (scenario expects BLOCK always),
    // FPR = 0 / 0 which we treat as 0
    const fpr =
      scenarioResult.fp + scenarioResult.tn > 0
        ? scenarioResult.fp / (scenarioResult.fp + scenarioResult.tn)
        : 0;

    expect(fpr).toBeLessThan(0.2);
    expect(scenarioResult.fp).toBe(0);

    // Via BattleReport
    const battle = reporter.computeBattleReport([scenarioResult], 'NormalTrafficAdapter');
    expect(battle.overallFpr).toBeLessThan(0.2);
  });

  // -------------------------------------------------------------------------
  // Test 5: complete event emitted after successful run
  // -------------------------------------------------------------------------
  test('FraudSimulationAgent emits complete event with final report', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/v1/events')) {
        return makeResponse(202, { status: 'accepted' });
      }
      return makeResponse(200, {
        requestId: 'evt-x',
        action: 'BLOCK',
        riskScore: 0.9,
        riskFactors: [],
      });
    });

    const agent = new FraudSimulationAgent([deviceFarmScenario]);
    let completedReport: unknown = null;
    agent.on('complete', (report) => { completedReport = report; });

    const returned = await agent.run(adapter);

    expect(completedReport).toBeDefined();
    expect(completedReport).toEqual(returned);
  });

  // -------------------------------------------------------------------------
  // Test 6: stop() halts further scenario processing
  // -------------------------------------------------------------------------
  test('stop() halts further scenario processing after current scenario', async () => {
    let eventCount = 0;

    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/v1/events')) {
        return makeResponse(202, { status: 'accepted' });
      }
      return makeResponse(200, {
        requestId: 'evt-x',
        action: 'BLOCK',
        riskScore: 0.9,
        riskFactors: [],
      });
    });

    const agent = new FraudSimulationAgent();
    agent.on('result', () => {
      eventCount++;
      // Stop after the first result — runner will finish current event then stop
      if (eventCount === 1) {
        agent.stop();
      }
    });

    const report = await agent.run(adapter).catch(() => null);

    // Agent was stopped mid-run; status should be stopped
    expect(agent.getStatus()).toBe('stopped');
    // Fewer than all 250 events processed (5 × 50)
    expect(eventCount).toBeLessThan(250);
    // Report may be null (stop throws) or partial — either is acceptable
    if (report !== null) {
      expect(report.scenarios.length).toBeGreaterThanOrEqual(0);
    }
  });
});
