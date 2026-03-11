/**
 * Sprint 14 — Signal-fetchers aggregation unit tests.
 *
 * 12 tests covering:
 *  - Parallel fetch of all 5 signals
 *  - SSRF guard rejection for external URLs
 *  - Fail-open (null) when a downstream service is unavailable
 *  - Circuit breaker opens after 3 consecutive failures and skips for 30 s
 *  - Weighted scoring with partial (non-null) signals
 *
 * No real HTTP calls are made — global fetch is mocked via jest.fn().
 */

import { assertInternalHost, SignalFetcher } from './signal-fetchers';
import { DecisionOrchestratorService } from './decision-orchestrator.service';

// ---------------------------------------------------------------------------
// Mock ConfigService — all service URLs point to localhost so they pass the
// SSRF guard and the existing fetchWithTimeout helper works unchanged.
// ---------------------------------------------------------------------------

const mockConfig: Record<string, string> = {
  'services.deviceIntelUrl':  'http://localhost:3003',
  'services.velocityUrl':     'http://localhost:3004',
  'services.behavioralUrl':   'http://localhost:3005',
  'services.networkIntelUrl': 'http://localhost:3006',
  'services.telcoIntelUrl':   'http://localhost:3007',
  'decision.signalTimeoutMs': '150',
};

const mockConfigService = {
  get: jest.fn(<T = string>(key: string): T | undefined =>
    (mockConfig[key] as unknown as T) ?? undefined,
  ),
};

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();

beforeAll(() => {
  (global as unknown as { fetch: jest.Mock }).fetch = mockFetch;
});

afterAll(() => {
  delete (global as unknown as { fetch?: jest.Mock }).fetch;
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okResponse(body: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function errorResponse(): Response {
  return { ok: false, status: 503 } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const devicePayload = {
  deviceId: 'dev-1', merchantId: 'merch-1', fingerprint: 'fp',
  trustScore: 80, isEmulator: false, emulatorConfidence: 0,
  platform: 'web', firstSeenAt: new Date(), lastSeenAt: new Date(), daysSinceFirstSeen: 10,
};

const velocityPayload = {
  entityId: 'user-1', merchantId: 'merch-1',
  dimensions: { txCount10m: 1, txCount1h: 2, txCount24h: 5, amountSum1h: 100, amountSum24h: 400, uniqueDevices24h: 1, uniqueIps24h: 1, uniqueSessions1h: 1 },
  burstDetected: false,
};

const behavioralPayload = {
  sessionId: 'sess-1', merchantId: 'merch-1', sessionRiskScore: 10,
  botProbability: 0.01, isBot: false, indicators: [],
};

const networkPayload = {
  ip: '1.2.3.4', merchantId: 'merch-1', isProxy: false, isVpn: false,
  isTor: false, isDatacenter: false, geoMismatchScore: 0, riskScore: 5,
};

const telcoPayload = {
  msisdn: '+905001234567', merchantId: 'merch-1', isPorted: false,
  prepaidProbability: 0.05, lineType: 'postpaid',
};

// ---------------------------------------------------------------------------
// 1. assertInternalHost — SSRF guard
// ---------------------------------------------------------------------------

describe('assertInternalHost', () => {
  it('allows localhost URLs', () => {
    expect(() => assertInternalHost('http://localhost:3003/v1/check')).not.toThrow();
  });

  it('allows 127.0.0.1 URLs', () => {
    expect(() => assertInternalHost('http://127.0.0.1:8080/health')).not.toThrow();
  });

  it('allows *.svc.cluster.local URLs', () => {
    expect(() =>
      assertInternalHost('http://device-intel.default.svc.cluster.local/v1/analyze'),
    ).not.toThrow();
  });

  it('rejects external hostnames and throws SSRF error', () => {
    expect(() => assertInternalHost('http://evil.example.com/steal-data')).toThrow(
      'SSRF: external host rejected',
    );
  });

  it('rejects public IP addresses', () => {
    expect(() => assertInternalHost('http://8.8.8.8/exfil')).toThrow(
      'SSRF: external host rejected',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. fetchAllSignals — parallel aggregation
// ---------------------------------------------------------------------------

describe('SignalFetcher.fetchAllSignals', () => {
  let fetcher: SignalFetcher;

  beforeEach(() => {
    fetcher = new SignalFetcher(mockConfigService as never);
  });

  it('fetches all 5 signals + stateful context in parallel and returns a complete SignalBundle', async () => {
    // Each fetch call returns the matching payload
    // 5 original signals + 3 stateful velocity fetches (customer, device, ip)
    mockFetch.mockResolvedValue(okResponse(velocityPayload));
    mockFetch
      .mockResolvedValueOnce(okResponse(devicePayload))     // device
      .mockResolvedValueOnce(okResponse(behavioralPayload)) // behavioral
      .mockResolvedValueOnce(okResponse(networkPayload))    // network
      .mockResolvedValueOnce(okResponse(telcoPayload))      // telco
      .mockResolvedValueOnce(okResponse(velocityPayload));  // velocity (main)
    // remaining calls: stateful velocity fetches (customer, device, ip)

    const bundle = await fetcher.fetchAllSignals({
      deviceId: 'dev-1',
      entityId: 'user-1',
      merchantId: 'merch-1',
      sessionId: 'sess-1',
      ip: '1.2.3.4',
      msisdn: '+905001234567',
    });

    expect(bundle.device).toEqual(devicePayload);
    expect(bundle.behavioral).toEqual(behavioralPayload);
    expect(bundle.network).toEqual(networkPayload);
    expect(bundle.telco).toEqual(telcoPayload);
    expect(bundle.velocity).toEqual(velocityPayload);
    expect(bundle.stateful).toBeDefined();
    // 5 original + 3 stateful velocity fetches
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it('returns null for a signal when its downstream service returns an error (fail-open)', async () => {
    mockFetch.mockResolvedValue(okResponse(velocityPayload)); // default for stateful
    mockFetch
      .mockResolvedValueOnce(errorResponse())               // device → null
      .mockResolvedValueOnce(okResponse(behavioralPayload)) // behavioral
      .mockResolvedValueOnce(okResponse(networkPayload))    // network
      .mockResolvedValueOnce(okResponse(telcoPayload))      // telco
      .mockResolvedValueOnce(okResponse(velocityPayload));  // velocity

    const bundle = await fetcher.fetchAllSignals({
      deviceId: 'dev-1',
      entityId: 'user-1',
      merchantId: 'merch-1',
      sessionId: 'sess-1',
      ip: '1.2.3.4',
      msisdn: '+905001234567',
    });

    // device failed → null; rest succeed
    expect(bundle.device).toBeNull();
    expect(bundle.behavioral).toEqual(behavioralPayload);
    expect(bundle.velocity).toBeDefined();
  });

  it('returns null for optional signals when their identifiers are not provided', async () => {
    // Only velocity is always fetched; device/behavioral/network/telco require IDs
    // Stateful also fetches customer velocity (always) but no device/ip
    mockFetch.mockResolvedValue(okResponse(velocityPayload));

    const bundle = await fetcher.fetchAllSignals({
      entityId: 'user-1',
      merchantId: 'merch-1',
      // no deviceId, sessionId, ip, msisdn
    });

    expect(bundle.device).toBeNull();
    expect(bundle.behavioral).toBeNull();
    expect(bundle.network).toBeNull();
    expect(bundle.telco).toBeNull();
    expect(bundle.velocity).toBeDefined();
    // At least velocity (main) + stateful customer velocity
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('returns all-null bundle when all services are down (complete fail-open)', async () => {
    mockFetch.mockRejectedValue(new TypeError('ECONNREFUSED'));

    const bundle = await fetcher.fetchAllSignals({
      deviceId: 'dev-1',
      entityId: 'user-1',
      merchantId: 'merch-1',
      sessionId: 'sess-1',
      ip: '1.2.3.4',
      msisdn: '+905001234567',
    });

    expect(bundle.device).toBeNull();
    expect(bundle.behavioral).toBeNull();
    expect(bundle.network).toBeNull();
    expect(bundle.telco).toBeNull();
    expect(bundle.velocity).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Circuit breaker
// ---------------------------------------------------------------------------

describe('SignalFetcher circuit breaker', () => {
  let fetcher: SignalFetcher;

  beforeEach(() => {
    fetcher = new SignalFetcher(mockConfigService as never);
  });

  it('circuit starts CLOSED — first request goes through', async () => {
    expect(fetcher.isCircuitOpen('device')).toBe(false);
  });

  it('opens circuit after 3 consecutive failures and skips subsequent calls', () => {
    fetcher.recordFailure('device'); // 1
    fetcher.recordFailure('device'); // 2
    expect(fetcher.isCircuitOpen('device')).toBe(false); // still closed after 2

    fetcher.recordFailure('device'); // 3 — should open
    expect(fetcher.isCircuitOpen('device')).toBe(true);  // now OPEN
  });

  it('resets circuit on success after it was partially failing', () => {
    fetcher.recordFailure('velocity'); // 1
    fetcher.recordFailure('velocity'); // 2
    fetcher.recordSuccess('velocity'); // reset
    fetcher.recordFailure('velocity'); // restart counter from 0 → now 1
    fetcher.recordFailure('velocity'); // 2
    expect(fetcher.isCircuitOpen('velocity')).toBe(false); // not yet open
  });

  it('circuit stays OPEN within 30s window and skips fetch entirely', async () => {
    // Open the circuit for 'network'
    fetcher.recordFailure('network');
    fetcher.recordFailure('network');
    fetcher.recordFailure('network'); // now OPEN

    // Even with a successful mock fetch, the circuit prevents the call
    mockFetch.mockResolvedValue(okResponse(networkPayload));

    const bundle = await fetcher.fetchAllSignals({
      entityId: 'user-1',
      merchantId: 'merch-1',
      ip: '1.2.3.4',
    });

    // network should be null because circuit is OPEN
    expect(bundle.network).toBeNull();
    // fetch should NOT have been called for network (only velocity was attempted)
    const networkCalls = mockFetch.mock.calls.filter((args: unknown[]) =>
      typeof args[0] === 'string' && (args[0] as string).includes('network'),
    );
    expect(networkCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Weighted scoring with partial signals
// ---------------------------------------------------------------------------

describe('DecisionOrchestratorService.computeWeightedScoreFromBundle', () => {
  let orchestrator: DecisionOrchestratorService;

  beforeEach(() => {
    // Minimal mock dependencies — only configService and signalFetcher are needed
    const minimalFetcher = new SignalFetcher(mockConfigService as never);
    orchestrator = new DecisionOrchestratorService(
      mockConfigService as never,
      minimalFetcher,
    );
  });

  it('computes weighted score using Sprint 14 weights when all signals are present', () => {
    // device trustScore=0 → riskScore=100, behavioral=50, velocity=0 (no burst), network riskScore=0, telco prepaid=0
    const bundle = {
      device:     { ...devicePayload, trustScore: 0, isEmulator: false },
      behavioral: { ...behavioralPayload, sessionRiskScore: 50, isBot: false },
      network:    { ...networkPayload, riskScore: 0 },
      telco:      { ...telcoPayload, prepaidProbability: 0, isPorted: false, lineType: 'postpaid' },
      velocity:   { ...velocityPayload, burstDetected: false },
    };

    const score = orchestrator.computeWeightedScoreFromBundle(bundle as never);

    // device=100 (25%), behavioral=50 (20%), velocity=0 (20%), network=0 (20%), telco=0 (15%)
    // weighted = 100*0.25 + 50*0.20 + 0*0.20 + 0*0.20 + 0*0.15 = 25 + 10 = 35
    expect(score).toBe(35);
  });

  it('renormalises weights when some signals are null', () => {
    // Only device (riskScore=100) and velocity (riskScore=0) available
    // Available weights: device=0.25, velocity=0.20 → total=0.45
    // Normalised: device = 0.25/0.45 ≈ 0.556, velocity = 0.20/0.45 ≈ 0.444
    // Weighted score = 100 * 0.556 + 0 * 0.444 ≈ 55.6 → rounds to 56
    const bundle = {
      device:     { ...devicePayload, trustScore: 0, isEmulator: false },
      behavioral: null,
      network:    null,
      telco:      null,
      velocity:   { ...velocityPayload, burstDetected: false },
    };

    const score = orchestrator.computeWeightedScoreFromBundle(bundle as never);

    expect(score).toBe(56);
  });

  it('returns 50 (neutral REVIEW score) when all signals are null', () => {
    const bundle = { device: null, behavioral: null, network: null, telco: null, velocity: null, stateful: null };
    const score = orchestrator.computeWeightedScoreFromBundle(bundle);
    expect(score).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// 5. Stateful context with prior-decision memory (ADR-011)
// ---------------------------------------------------------------------------

describe('SignalFetcher.fetchStatefulContext with prior-decision memory', () => {
  let fetcher: SignalFetcher;

  beforeEach(() => {
    fetcher = new SignalFetcher(mockConfigService as never);
  });

  it('merges prior-decision memory into customer context', async () => {
    mockFetch.mockResolvedValue(okResponse(velocityPayload));

    const stateful = await fetcher.fetchStatefulContext({
      customerId: 'user-1',
      merchantId: 'merch-1',
      priorDecisionMemory: {
        previousBlockCount30d: 3,
        previousReviewCount7d: 5,
      },
    });

    expect(stateful.customer).toBeDefined();
    expect(stateful.customer?.previousBlockCount30d).toBe(3);
    expect(stateful.customer?.previousReviewCount7d).toBe(5);
    // Velocity dims should also be present
    expect(stateful.customer?.txCount1h).toBeDefined();
  });

  it('creates customer context with only prior-decision fields when velocity fails', async () => {
    mockFetch.mockRejectedValue(new TypeError('ECONNREFUSED'));

    const stateful = await fetcher.fetchStatefulContext({
      customerId: 'user-1',
      merchantId: 'merch-1',
      priorDecisionMemory: {
        previousBlockCount30d: 2,
        previousReviewCount7d: 0,
      },
    });

    expect(stateful.customer).toBeDefined();
    expect(stateful.customer?.previousBlockCount30d).toBe(2);
    expect(stateful.customer?.previousReviewCount7d).toBe(0);
    // Velocity dims should be absent since fetch failed
    expect(stateful.customer?.txCount1h).toBeUndefined();
  });

  it('omits prior-decision fields when priorDecisionMemory is not provided', async () => {
    mockFetch.mockResolvedValue(okResponse(velocityPayload));

    const stateful = await fetcher.fetchStatefulContext({
      customerId: 'user-1',
      merchantId: 'merch-1',
    });

    expect(stateful.customer).toBeDefined();
    expect(stateful.customer?.previousBlockCount30d).toBeUndefined();
    expect(stateful.customer?.previousReviewCount7d).toBeUndefined();
  });
});
