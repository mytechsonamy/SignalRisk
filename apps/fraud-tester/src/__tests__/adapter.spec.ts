/**
 * FraudTester — Adapter & Reporter Unit Tests
 *
 * 6 tests covering:
 *   1. SignalRiskAdapter.healthCheck() → HTTP 200 → true
 *   2. SignalRiskAdapter.healthCheck() → HTTP 500 → false
 *   3. SignalRiskAdapter.submitEvent() posts to the correct endpoint
 *   4. SignalRiskAdapter.getDecision() → 404 → null
 *   5. DetectionReporter.compute() → TP/FP/FN/TN are accurate
 *   6. device-farm scenario generator → 50 events, all with the same fingerprint
 */

import { SignalRiskAdapter } from '../adapters/signalrisk.adapter';
import { DetectionReporter } from '../reporter/detection-reporter';
import { deviceFarmScenario, SHARED_FINGERPRINT } from '../scenarios/catalog/device-farm.scenario';
import type { AttackResult } from '../scenarios/types';

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

const mockFetch = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
global.fetch = mockFetch as unknown as typeof fetch;

function makeResponse(status: number, body: unknown = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as Response;
}

const BASE_CONFIG = {
  baseUrl: 'http://localhost:3002',
  apiKey: 'sk_test_aabbccddeeff00112233445566778899',
  merchantId: 'merchant-test-001',
  decisionUrl: 'http://localhost:3009',
};

// ---------------------------------------------------------------------------
// Test 1: healthCheck → 200 → true
// ---------------------------------------------------------------------------
describe('SignalRiskAdapter', () => {
  beforeEach(() => mockFetch.mockReset());

  it('healthCheck returns true when /health responds 200', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200));

    const adapter = new SignalRiskAdapter(BASE_CONFIG);
    const result = await adapter.healthCheck();

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3002/health');
  });

  // ---------------------------------------------------------------------------
  // Test 2: healthCheck → 500 → false
  // ---------------------------------------------------------------------------
  it('healthCheck returns false when /health responds 500', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(500));

    const adapter = new SignalRiskAdapter(BASE_CONFIG);
    const result = await adapter.healthCheck();

    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 3: submitEvent POSTs to the correct endpoint
  // ---------------------------------------------------------------------------
  it('submitEvent sends POST to /v1/events with correct headers', async () => {
    // First call: POST /v1/events → 202
    mockFetch.mockResolvedValueOnce(makeResponse(202, { status: 'accepted' }));

    // Second call: GET /v1/decisions/{eventId} → 200 with a valid decision
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, {
        requestId: 'evt-test-001',
        action: 'BLOCK',
        riskScore: 0.95,
        riskFactors: [{ signal: 'device', value: 0.9 }],
      }),
    );

    const adapter = new SignalRiskAdapter(BASE_CONFIG);
    const event = {
      eventId: 'evt-test-001',
      merchantId: 'merchant-test-001',
      deviceFingerprint: 'fp-abc',
      userId: 'user-1',
      amount: 100,
      currency: 'USD',
      metadata: {},
    };

    await adapter.submitEvent(event);

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3002/v1/events');
    expect(options.method).toBe('POST');

    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${BASE_CONFIG.apiKey}`);
    expect(headers['X-Merchant-ID']).toBe(BASE_CONFIG.merchantId);
  });

  // ---------------------------------------------------------------------------
  // Test 4: getDecision → 404 → null
  // ---------------------------------------------------------------------------
  it('getDecision returns null when response is 404', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(404));

    const adapter = new SignalRiskAdapter(BASE_CONFIG);
    const result = await adapter.getDecision('evt-not-found');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 5: DetectionReporter.compute — TP/FP/FN/TN
// ---------------------------------------------------------------------------
describe('DetectionReporter', () => {
  it('correctly calculates TP, FP, FN, TN and detectionRate', () => {
    const reporter = new DetectionReporter();

    const scenario = deviceFarmScenario; // expectedOutcome.decision = 'BLOCK'

    const makeResult = (systemDecision: 'ALLOW' | 'REVIEW' | 'BLOCK'): AttackResult => ({
      event: {
        eventId: 'evt-1',
        merchantId: 'merchant-test-001',
        deviceFingerprint: SHARED_FINGERPRINT,
        userId: 'user-1',
        metadata: {},
      },
      decision: {
        eventId: 'evt-1',
        decision: systemDecision,
        riskScore: systemDecision === 'ALLOW' ? 0.1 : 0.9,
        latencyMs: 50,
      },
      detected: systemDecision !== 'ALLOW',
    });

    // 4 TP (BLOCK), 1 FN (ALLOW)
    const results: AttackResult[] = [
      makeResult('BLOCK'),
      makeResult('BLOCK'),
      makeResult('BLOCK'),
      makeResult('BLOCK'),
      makeResult('ALLOW'), // missed — FN
    ];

    const result = reporter.compute(results, scenario);

    expect(result.tp).toBe(4);
    expect(result.fn).toBe(1);
    expect(result.fp).toBe(0);
    expect(result.tn).toBe(0);
    expect(result.detectionRate).toBeCloseTo(4 / 5, 5);
    expect(result.totalEvents).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Test 6: device-farm scenario — 50 events, all same fingerprint
// ---------------------------------------------------------------------------
describe('deviceFarmScenario', () => {
  it('generates exactly 50 events all with the shared device fingerprint', async () => {
    const events = [];
    for await (const event of deviceFarmScenario.generate(0)) {
      events.push(event);
    }

    expect(events).toHaveLength(50);
    for (const event of events) {
      expect(event.deviceFingerprint).toBe(SHARED_FINGERPRINT);
    }
  });
});
