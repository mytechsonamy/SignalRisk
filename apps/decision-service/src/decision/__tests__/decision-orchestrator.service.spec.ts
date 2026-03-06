import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DecisionOrchestratorService } from '../decision-orchestrator.service';
import {
  SignalFetcher,
  DeviceSignal,
  VelocitySignal,
  BehavioralSignal,
  NetworkSignal,
  TelcoSignal,
} from '../signal-fetchers';
import { DecisionRequest } from '../decision.types';
import { DecisionCacheService } from '../decision-cache.service';

// ---------------------------------------------------------------------------
// OpenTelemetry mock (must be defined before the module under test is imported,
// but the module is already imported above so we set up the mock via the
// mockStartSpan helper captured in the factory below)
// ---------------------------------------------------------------------------
const mockSpanEnd = jest.fn();
const mockSpanSetAttribute = jest.fn();
const mockSpanSetStatus = jest.fn();
const mockSpan = {
  end: mockSpanEnd,
  setAttribute: mockSpanSetAttribute,
  setStatus: mockSpanSetStatus,
};
const mockStartSpan = jest.fn(() => mockSpan);

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: jest.fn(() => ({ startSpan: mockStartSpan })),
  },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      'decision.signalTimeoutMs': 150,
    };
    return config[key];
  }),
};

const mockSignalFetcher = {
  fetchDeviceSignal:    jest.fn(),
  fetchVelocitySignal:  jest.fn(),
  fetchBehavioralSignal: jest.fn(),
  fetchNetworkSignal:   jest.fn(),
  fetchTelcoSignal:     jest.fn(),
};

const mockDecisionCache = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  invalidate: jest.fn().mockResolvedValue(undefined),
  cacheKey: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<DecisionRequest> = {}): DecisionRequest {
  return {
    requestId:  'req-001',
    merchantId: 'merchant-001',
    entityId:   'user-001',
    deviceId:   'device-001',
    sessionId:  'session-001',
    ip:         '1.2.3.4',
    msisdn:     '+905001234567',
    ...overrides,
  };
}

const mockDeviceSignal: DeviceSignal = {
  deviceId:           'device-001',
  merchantId:         'merchant-001',
  fingerprint:        'fp-001',
  trustScore:         80,     // low risk → riskScore 20
  isEmulator:         false,
  emulatorConfidence: 0,
  platform:           'web',
  firstSeenAt:        new Date('2026-01-01'),
  lastSeenAt:         new Date(),
  daysSinceFirstSeen: 65,
};

const mockVelocitySignal: VelocitySignal = {
  entityId:   'user-001',
  merchantId: 'merchant-001',
  dimensions: {
    txCount1h:        2,
    txCount24h:       8,
    amountSum1h:      100,
    uniqueDevices24h: 1,
    uniqueIps24h:     1,
    uniqueSessions1h: 1,
  },
  burstDetected: false,
};

const mockBehavioralSignal: BehavioralSignal = {
  sessionId:        'session-001',
  merchantId:       'merchant-001',
  sessionRiskScore: 10,
  botProbability:   0.02,
  isBot:            false,
  indicators:       [],
};

const mockNetworkSignal: NetworkSignal = {
  ip:               '1.2.3.4',
  merchantId:       'merchant-001',
  isProxy:          false,
  isVpn:            false,
  isTor:            false,
  isDatacenter:     false,
  geoMismatchScore: 0,
  riskScore:        5,
};

const mockTelcoSignal: TelcoSignal = {
  msisdn:             '+905001234567',
  merchantId:         'merchant-001',
  lineType:           'postpaid',
  isPorted:           false,
  prepaidProbability: 0.05,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupAllSignals() {
  mockSignalFetcher.fetchDeviceSignal.mockResolvedValue(mockDeviceSignal);
  mockSignalFetcher.fetchVelocitySignal.mockResolvedValue(mockVelocitySignal);
  mockSignalFetcher.fetchBehavioralSignal.mockResolvedValue(mockBehavioralSignal);
  mockSignalFetcher.fetchNetworkSignal.mockResolvedValue(mockNetworkSignal);
  mockSignalFetcher.fetchTelcoSignal.mockResolvedValue(mockTelcoSignal);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DecisionOrchestratorService', () => {
  let service: DecisionOrchestratorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDecisionCache.get.mockResolvedValue(null);
    mockDecisionCache.set.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecisionOrchestratorService,
        { provide: ConfigService,  useValue: mockConfigService },
        { provide: SignalFetcher,  useValue: mockSignalFetcher },
        { provide: DecisionCacheService, useValue: mockDecisionCache },
      ],
    }).compile();

    service = module.get<DecisionOrchestratorService>(DecisionOrchestratorService);
  });

  // -------------------------------------------------------------------------
  // computeWeightedScore (unit)
  // -------------------------------------------------------------------------

  describe('computeWeightedScore', () => {
    it('returns 50 when all signals are unavailable', () => {
      const scores = [
        { name: 'device',     score: null, weight: 0.35 },
        { name: 'velocity',   score: null, weight: 0.25 },
        { name: 'behavioral', score: null, weight: 0.20 },
        { name: 'network',    score: null, weight: 0.15 },
        { name: 'telco',      score: null, weight: 0.05 },
      ];
      expect(service.computeWeightedScore(scores)).toBe(50);
    });

    it('renormalizes weights when one signal is missing', () => {
      // Only device (0.35) and velocity (0.25) available — total weight 0.60
      // device score 60, velocity score 40
      // weighted = (60 * 0.35 + 40 * 0.25) / 0.60
      //          = (21 + 10) / 0.60
      //          = 31 / 0.60 ≈ 51.67 → 52
      const scores = [
        { name: 'device',     score: 60,   weight: 0.35 },
        { name: 'velocity',   score: 40,   weight: 0.25 },
        { name: 'behavioral', score: null, weight: 0.20 },
        { name: 'network',    score: null, weight: 0.15 },
        { name: 'telco',      score: null, weight: 0.05 },
      ];
      const result = service.computeWeightedScore(scores);
      expect(result).toBe(52);
    });
  });

  // -------------------------------------------------------------------------
  // computeAction (unit)
  // -------------------------------------------------------------------------

  describe('computeAction', () => {
    it('returns BLOCK for riskScore >= 70', () => {
      expect(service.computeAction(70)).toBe('BLOCK');
      expect(service.computeAction(75)).toBe('BLOCK');
      expect(service.computeAction(100)).toBe('BLOCK');
    });

    it('returns REVIEW for riskScore >= 40 and < 70', () => {
      expect(service.computeAction(40)).toBe('REVIEW');
      expect(service.computeAction(50)).toBe('REVIEW');
      expect(service.computeAction(69)).toBe('REVIEW');
    });

    it('returns ALLOW for riskScore < 40', () => {
      expect(service.computeAction(39)).toBe('ALLOW');
      expect(service.computeAction(20)).toBe('ALLOW');
      expect(service.computeAction(0)).toBe('ALLOW');
    });
  });

  // -------------------------------------------------------------------------
  // decide — integration-level
  // -------------------------------------------------------------------------

  describe('decide', () => {
    it('all signals available → computes weighted score and correct action (ALLOW)', async () => {
      setupAllSignals();

      const result = await service.decide(makeRequest());

      expect(result.requestId).toBe('req-001');
      expect(result.merchantId).toBe('merchant-001');
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
      // With trustScore=80 → deviceRisk=20, low velocity, low behavioral, low network, low telco
      // → expect ALLOW
      expect(result.action).toBe('ALLOW');
      expect(result.cached).toBe(false);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.riskFactors.length).toBeGreaterThan(0);
    });

    it('riskScore=75 → BLOCK', async () => {
      // device with very low trust score → high device risk
      mockSignalFetcher.fetchDeviceSignal.mockResolvedValue({
        ...mockDeviceSignal,
        trustScore: 10,     // deviceRisk = 90
        isEmulator: false,
      });
      mockSignalFetcher.fetchVelocitySignal.mockResolvedValue({
        ...mockVelocitySignal,
        dimensions: { ...mockVelocitySignal.dimensions, txCount1h: 25 }, // +50
        burstDetected: true,
        burstRatio: 5,
      });
      mockSignalFetcher.fetchBehavioralSignal.mockResolvedValue({
        ...mockBehavioralSignal,
        sessionRiskScore: 80,
        isBot: true,
      });
      mockSignalFetcher.fetchNetworkSignal.mockResolvedValue({
        ...mockNetworkSignal,
        isTor: true,
        riskScore: 90,
      });
      mockSignalFetcher.fetchTelcoSignal.mockResolvedValue({
        ...mockTelcoSignal,
        isPorted: true,
        prepaidProbability: 0.9,
      });

      const result = await service.decide(makeRequest());
      expect(result.action).toBe('BLOCK');
      expect(result.riskScore).toBeGreaterThanOrEqual(70);
    });

    it('riskScore=50 → REVIEW', async () => {
      // Moderate risk: device trust=50, velocity ok, behavioral=50, network=30, telco ok
      mockSignalFetcher.fetchDeviceSignal.mockResolvedValue({
        ...mockDeviceSignal,
        trustScore: 50,  // deviceRisk = 50
      });
      mockSignalFetcher.fetchVelocitySignal.mockResolvedValue({
        ...mockVelocitySignal,
        dimensions: { ...mockVelocitySignal.dimensions, txCount1h: 8 }, // +10
      });
      mockSignalFetcher.fetchBehavioralSignal.mockResolvedValue({
        ...mockBehavioralSignal,
        sessionRiskScore: 60,
      });
      mockSignalFetcher.fetchNetworkSignal.mockResolvedValue({
        ...mockNetworkSignal,
        isProxy: true,
        riskScore: 40,
      });
      mockSignalFetcher.fetchTelcoSignal.mockResolvedValue({
        ...mockTelcoSignal,
        isPorted: false,
        prepaidProbability: 0.3,
      });

      const result = await service.decide(makeRequest());
      expect(result.action).toBe('REVIEW');
      expect(result.riskScore).toBeGreaterThanOrEqual(40);
      expect(result.riskScore).toBeLessThan(70);
    });

    it('riskScore=20 → ALLOW', async () => {
      setupAllSignals();  // all low-risk mocks

      const result = await service.decide(makeRequest());
      expect(result.action).toBe('ALLOW');
      expect(result.riskScore).toBeLessThan(40);
    });

    it('one signal times out → excluded from scoring, weights renormalized', async () => {
      // device signal takes 200ms > 150ms timeout → should be excluded
      mockSignalFetcher.fetchDeviceSignal.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockDeviceSignal), 200)),
      );
      mockSignalFetcher.fetchVelocitySignal.mockResolvedValue(mockVelocitySignal);
      mockSignalFetcher.fetchBehavioralSignal.mockResolvedValue(mockBehavioralSignal);
      mockSignalFetcher.fetchNetworkSignal.mockResolvedValue(mockNetworkSignal);
      mockSignalFetcher.fetchTelcoSignal.mockResolvedValue(mockTelcoSignal);

      const result = await service.decide(makeRequest());

      // Score should still be computed (device is excluded)
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
      // Risk factors should not include device signal
      const deviceFactor = result.riskFactors.find((f) => f.signal === 'device.trustScore');
      expect(deviceFactor).toBeUndefined();
    }, 1000);

    it('all signals fail → fallback to REVIEW (score=50)', async () => {
      mockSignalFetcher.fetchDeviceSignal.mockRejectedValue(new Error('timeout'));
      mockSignalFetcher.fetchVelocitySignal.mockRejectedValue(new Error('timeout'));
      mockSignalFetcher.fetchBehavioralSignal.mockRejectedValue(new Error('timeout'));
      mockSignalFetcher.fetchNetworkSignal.mockRejectedValue(new Error('timeout'));
      mockSignalFetcher.fetchTelcoSignal.mockRejectedValue(new Error('timeout'));

      const result = await service.decide(makeRequest());

      expect(result.riskScore).toBe(50);
      expect(result.action).toBe('REVIEW');
    });

    it('risk factors are populated with top contributors', async () => {
      setupAllSignals();

      const result = await service.decide(makeRequest());

      expect(result.riskFactors).toBeInstanceOf(Array);
      expect(result.riskFactors.length).toBeGreaterThan(0);

      // Each factor must have required fields
      for (const factor of result.riskFactors) {
        expect(factor.signal).toBeTruthy();
        expect(factor.description).toBeTruthy();
        expect(typeof factor.contribution).toBe('number');
      }

      // Factors should be sorted descending by contribution
      for (let i = 0; i < result.riskFactors.length - 1; i++) {
        expect(result.riskFactors[i].contribution).toBeGreaterThanOrEqual(
          result.riskFactors[i + 1].contribution,
        );
      }
    });

    it('emulator device → rule:emulator-detected in appliedRules', async () => {
      mockSignalFetcher.fetchDeviceSignal.mockResolvedValue({
        ...mockDeviceSignal,
        isEmulator: true,
        emulatorConfidence: 0.9,
        trustScore: 20,
      });
      mockSignalFetcher.fetchVelocitySignal.mockResolvedValue(mockVelocitySignal);
      mockSignalFetcher.fetchBehavioralSignal.mockResolvedValue(mockBehavioralSignal);
      mockSignalFetcher.fetchNetworkSignal.mockResolvedValue(mockNetworkSignal);
      mockSignalFetcher.fetchTelcoSignal.mockResolvedValue(mockTelcoSignal);

      const result = await service.decide(makeRequest());

      expect(result.appliedRules).toContain('rule:emulator-detected');
    });

    it('skips behavioral signal when sessionId is absent', async () => {
      setupAllSignals();

      const result = await service.decide(makeRequest({ sessionId: undefined }));

      expect(mockSignalFetcher.fetchBehavioralSignal).not.toHaveBeenCalled();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
    });

    it('skips network signal when ip is absent', async () => {
      setupAllSignals();

      const result = await service.decide(makeRequest({ ip: undefined }));

      expect(mockSignalFetcher.fetchNetworkSignal).not.toHaveBeenCalled();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
    });

    it('skips telco signal when msisdn is absent', async () => {
      setupAllSignals();

      const result = await service.decide(makeRequest({ msisdn: undefined }));

      expect(mockSignalFetcher.fetchTelcoSignal).not.toHaveBeenCalled();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
    });

    it('skips device signal when deviceId is absent', async () => {
      setupAllSignals();

      const result = await service.decide(makeRequest({ deviceId: undefined }));

      expect(mockSignalFetcher.fetchDeviceSignal).not.toHaveBeenCalled();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // Per-signal span instrumentation
  // -------------------------------------------------------------------------

  describe('per-signal span instrumentation', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Re-configure mockStartSpan after clearAllMocks
      mockStartSpan.mockReturnValue(mockSpan);
      setupAllSignals();
    });

    it('creates a span for device signal fetch with correct attributes', async () => {
      await service.decide(makeRequest());

      const allCalls = mockStartSpan.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const deviceSpanCall = allCalls.find((call) => call[0] === 'fetch.device-signal');
      expect(deviceSpanCall).toBeDefined();
      expect(deviceSpanCall![1]).toMatchObject({
        attributes: expect.objectContaining({
          'signal.type': 'device',
          'merchant.id': 'merchant-001',
        }),
      });
    });

    it('creates a span for velocity signal fetch with correct attributes', async () => {
      await service.decide(makeRequest());

      const allCalls = mockStartSpan.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const velocitySpanCall = allCalls.find((call) => call[0] === 'fetch.velocity-signal');
      expect(velocitySpanCall).toBeDefined();
      expect(velocitySpanCall![1]).toMatchObject({
        attributes: expect.objectContaining({
          'signal.type': 'velocity',
          'merchant.id': 'merchant-001',
        }),
      });
    });

    it('creates a span for behavioral signal fetch with correct attributes', async () => {
      await service.decide(makeRequest());

      const allCalls = mockStartSpan.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const behavioralSpanCall = allCalls.find((call) => call[0] === 'fetch.behavioral-signal');
      expect(behavioralSpanCall).toBeDefined();
      expect(behavioralSpanCall![1]).toMatchObject({
        attributes: expect.objectContaining({
          'signal.type': 'behavioral',
          'merchant.id': 'merchant-001',
        }),
      });
    });

    it('creates a span for network signal fetch with correct attributes', async () => {
      await service.decide(makeRequest());

      const allCalls = mockStartSpan.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const networkSpanCall = allCalls.find((call) => call[0] === 'fetch.network-signal');
      expect(networkSpanCall).toBeDefined();
      expect(networkSpanCall![1]).toMatchObject({
        attributes: expect.objectContaining({
          'signal.type': 'network',
          'merchant.id': 'merchant-001',
        }),
      });
    });

    it('creates a span for telco signal fetch with correct attributes', async () => {
      await service.decide(makeRequest());

      const allCalls = mockStartSpan.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const telcoSpanCall = allCalls.find((call) => call[0] === 'fetch.telco-signal');
      expect(telcoSpanCall).toBeDefined();
      expect(telcoSpanCall![1]).toMatchObject({
        attributes: expect.objectContaining({
          'signal.type': 'telco',
          'merchant.id': 'merchant-001',
        }),
      });
    });

    it('calls span.end() for every signal fetch span (5 total)', async () => {
      await service.decide(makeRequest());

      // 5 spans = device, velocity, behavioral, network, telco
      expect(mockSpanEnd).toHaveBeenCalledTimes(5);
    });

    it('calls span.end() even when a signal fetch throws an error', async () => {
      mockSignalFetcher.fetchDeviceSignal.mockRejectedValue(new Error('fetch failed'));

      await service.decide(makeRequest());

      // span.end() must still be called for the device span that errored
      expect(mockSpanEnd).toHaveBeenCalled();
    });

    it('sets signal.found=false attribute when signal returns null', async () => {
      // device fetch returns null (no deviceId in request)
      await service.decide(makeRequest({ deviceId: undefined }));

      // The device span should set signal.found=false
      const attrCalls = mockSpanSetAttribute.mock.calls as unknown as Array<[string, unknown]>;
      const signalFoundCalls = attrCalls.filter((call) => call[0] === 'signal.found');
      expect(signalFoundCalls.some((call) => call[1] === false)).toBe(true);
    });

    it('creates 5 spans for a full request with all optional fields populated', async () => {
      await service.decide(makeRequest());

      // Each of the 5 signal types gets one span
      const allCalls = mockStartSpan.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const spanNames = allCalls.map((call) => call[0]);
      expect(spanNames).toContain('fetch.device-signal');
      expect(spanNames).toContain('fetch.velocity-signal');
      expect(spanNames).toContain('fetch.behavioral-signal');
      expect(spanNames).toContain('fetch.network-signal');
      expect(spanNames).toContain('fetch.telco-signal');
    });
  });

  // -------------------------------------------------------------------------
  // Signal fetch timing instrumentation
  // -------------------------------------------------------------------------

  describe('signal fetch timing instrumentation', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockStartSpan.mockReturnValue(mockSpan);
      mockDecisionCache.get.mockResolvedValue(null);
      mockDecisionCache.set.mockResolvedValue(undefined);
    });

    it('records timing for each signal name after a decide call', async () => {
      setupAllSignals();

      await service.decide(makeRequest());

      const timings = service.getFetchTimings();
      expect(timings.length).toBeGreaterThan(0);
      const signalNames = timings.map((t) => t.signalName);
      expect(signalNames).toContain('device');
      expect(signalNames).toContain('velocity');
    });

    it('warns when a fetcher takes more than 100ms', async () => {
      // device signal artificially delayed 110ms
      mockSignalFetcher.fetchDeviceSignal.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockDeviceSignal), 110)),
      );
      mockSignalFetcher.fetchVelocitySignal.mockResolvedValue(mockVelocitySignal);
      mockSignalFetcher.fetchBehavioralSignal.mockResolvedValue(mockBehavioralSignal);
      mockSignalFetcher.fetchNetworkSignal.mockResolvedValue(mockNetworkSignal);
      mockSignalFetcher.fetchTelcoSignal.mockResolvedValue(mockTelcoSignal);

      const warnSpy = jest.spyOn((service as any).logger, 'warn');

      await service.decide(makeRequest());

      const slowWarnCalls = warnSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('Signal fetch slow'),
      );
      expect(slowWarnCalls.length).toBeGreaterThan(0);
      expect(slowWarnCalls[0][0]).toContain('device');
    }, 2000);

    it('does not warn when all fetchers are fast (under 100ms)', async () => {
      setupAllSignals();

      const warnSpy = jest.spyOn((service as any).logger, 'warn');

      await service.decide(makeRequest());

      const slowWarnCalls = warnSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('Signal fetch slow'),
      );
      expect(slowWarnCalls.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Decision cache integration
  // -------------------------------------------------------------------------

  describe('decision cache integration', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockStartSpan.mockReturnValue(mockSpan);
    });

    it('returns cached result when cache hits, with cached=true', async () => {
      const cachedResult = {
        requestId: 'req-001',
        merchantId: 'merchant-001',
        action: 'ALLOW',
        riskScore: 10,
        riskFactors: [],
        appliedRules: [],
        latencyMs: 5,
        cached: false,
        createdAt: new Date(),
      };
      mockDecisionCache.get.mockResolvedValue(cachedResult);

      const result = await service.decide(makeRequest());

      expect(result.cached).toBe(true);
      expect(result.action).toBe('ALLOW');
      expect(result.riskScore).toBe(10);
      // Signal fetchers should NOT be called on cache hit
      expect(mockSignalFetcher.fetchDeviceSignal).not.toHaveBeenCalled();
      expect(mockSignalFetcher.fetchVelocitySignal).not.toHaveBeenCalled();
    });

    it('stores result in cache after a fresh decision', async () => {
      mockDecisionCache.get.mockResolvedValue(null);
      setupAllSignals();

      await service.decide(makeRequest());

      expect(mockDecisionCache.set).toHaveBeenCalledWith(
        'merchant-001',
        'user-001',
        expect.objectContaining({ action: expect.any(String), riskScore: expect.any(Number) }),
      );
    });

    it('checks cache with correct merchantId and entityId', async () => {
      mockDecisionCache.get.mockResolvedValue(null);
      setupAllSignals();

      await service.decide(makeRequest({ merchantId: 'merch-x', entityId: 'ent-y' }));

      expect(mockDecisionCache.get).toHaveBeenCalledWith('merch-x', 'ent-y');
    });
  });
});
