/**
 * FraudTester — GenericHttpAdapter Unit Tests
 *
 * 6 tests covering:
 *   1. submitEvent → correct URL and headers
 *   2. submitEvent → nested 'result.action: BLOCK' → normalized BLOCK
 *   3. submitEvent → 'outcome: deny' → normalized BLOCK
 *   4. getDecision → 404 → null
 *   5. healthCheck → 200 → true; network error → false
 *   6. reset → no endpoint configured → no-op (no error thrown)
 */

import { GenericHttpAdapter } from '../adapters/generic-http.adapter';
import type { GenericAdapterConfig } from '../adapters/generic-http.adapter';
import type { FraudTestEvent } from '../adapters/base.adapter';

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

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_CONFIG: GenericAdapterConfig = {
  name: 'TestFraudSystem',
  baseUrl: 'http://fraud-system.example.com',
  apiKey: 'test-api-key-123',
  apiKeyHeader: 'X-API-Key',
  merchantIdHeader: 'X-Merchant-ID',
  merchantId: 'merchant-001',
  endpoints: {
    submitEvent: '/api/fraud/check',
    getDecision: '/api/fraud/result/{eventId}',
    healthCheck: '/health',
    reset: '/api/test/reset',
  },
  responseMapping: {
    decisionField: 'decision',
    riskScoreField: 'riskScore',
    eventIdField: 'eventId',
  },
};

const SAMPLE_EVENT: FraudTestEvent = {
  eventId: 'evt-abc-001',
  merchantId: 'merchant-001',
  deviceFingerprint: 'fp-test-123',
  userId: 'user-42',
  ipAddress: '1.2.3.4',
  amount: 250,
  currency: 'USD',
  metadata: { channel: 'web' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GenericHttpAdapter', () => {
  beforeEach(() => mockFetch.mockReset());

  // -------------------------------------------------------------------------
  // Test 1: submitEvent → correct URL and headers
  // -------------------------------------------------------------------------
  it('submitEvent calls the correct URL with the configured headers', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, { decision: 'ALLOW', riskScore: 0.2 }),
    );

    const adapter = new GenericHttpAdapter(BASE_CONFIG);
    await adapter.submitEvent(SAMPLE_EVENT);

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://fraud-system.example.com/api/fraud/check');
    expect(options.method).toBe('POST');

    const headers = options.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('test-api-key-123');
    expect(headers['X-Merchant-ID']).toBe('merchant-001');
    expect(headers['Content-Type']).toBe('application/json');
  });

  // -------------------------------------------------------------------------
  // Test 2: submitEvent → nested 'result.action: BLOCK' → normalized BLOCK
  // -------------------------------------------------------------------------
  it('submitEvent normalizes nested result.action=BLOCK to decision BLOCK', async () => {
    const nestedConfig: GenericAdapterConfig = {
      ...BASE_CONFIG,
      responseMapping: {
        decisionField: 'result.action',
        riskScoreField: 'risk.value',
      },
    };

    mockFetch.mockResolvedValueOnce(
      makeResponse(200, {
        result: { action: 'BLOCK' },
        risk: { value: 0.95 },
      }),
    );

    const adapter = new GenericHttpAdapter(nestedConfig);
    const decision = await adapter.submitEvent(SAMPLE_EVENT);

    expect(decision.decision).toBe('BLOCK');
    expect(decision.riskScore).toBeCloseTo(0.95);
    expect(decision.eventId).toBe(SAMPLE_EVENT.eventId);
  });

  // -------------------------------------------------------------------------
  // Test 3: submitEvent → 'outcome: deny' → normalized BLOCK
  // -------------------------------------------------------------------------
  it('submitEvent normalizes outcome=deny to decision BLOCK', async () => {
    const denyConfig: GenericAdapterConfig = {
      ...BASE_CONFIG,
      responseMapping: {
        decisionField: 'outcome',
        riskScoreField: 'score',
      },
    };

    mockFetch.mockResolvedValueOnce(
      makeResponse(200, { outcome: 'deny', score: 0.88 }),
    );

    const adapter = new GenericHttpAdapter(denyConfig);
    const decision = await adapter.submitEvent(SAMPLE_EVENT);

    expect(decision.decision).toBe('BLOCK');
    expect(decision.riskScore).toBeCloseTo(0.88);
  });

  // -------------------------------------------------------------------------
  // Test 4: getDecision → 404 → null
  // -------------------------------------------------------------------------
  it('getDecision returns null when the server responds with 404', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(404));

    const adapter = new GenericHttpAdapter(BASE_CONFIG);
    const result = await adapter.getDecision('evt-not-found');

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://fraud-system.example.com/api/fraud/result/evt-not-found',
      expect.objectContaining({}),
    );
  });

  // -------------------------------------------------------------------------
  // Test 5: healthCheck → 200 → true; network error → false
  // -------------------------------------------------------------------------
  it('healthCheck returns true on 200 and false on network error', async () => {
    const adapter = new GenericHttpAdapter(BASE_CONFIG);

    // First call: HTTP 200
    mockFetch.mockResolvedValueOnce(makeResponse(200));
    const healthy = await adapter.healthCheck();
    expect(healthy).toBe(true);

    // Second call: network error
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const unhealthy = await adapter.healthCheck();
    expect(unhealthy).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 6: reset → no endpoint configured → no-op (no error thrown)
  // -------------------------------------------------------------------------
  it('reset is a no-op and does not throw when no reset endpoint is configured', async () => {
    const noResetConfig: GenericAdapterConfig = {
      ...BASE_CONFIG,
      endpoints: {
        ...BASE_CONFIG.endpoints,
        reset: undefined,
      },
    };

    const adapter = new GenericHttpAdapter(noResetConfig);

    await expect(adapter.reset()).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
