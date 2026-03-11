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
  SignalBundle,
} from '../signal-fetchers';
import { DecisionRequest } from '../decision.types';
import { DecisionCacheService } from '../decision-cache.service';

// ---------------------------------------------------------------------------
// OpenTelemetry mock
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

// Mock fs for rule loading
jest.mock('fs', () => ({
  readFileSync: jest.fn(() => `
RULE emulator_block WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0
RULE very_low_trust WHEN device.trustScore < 20 THEN BLOCK WEIGHT 0.9
RULE low_trust WHEN device.trustScore < 40 THEN REVIEW WEIGHT 0.7 MISSING SKIP
RULE velocity_burst WHEN velocity.burstDetected == true THEN REVIEW WEIGHT 0.8 MISSING SKIP
RULE high_velocity WHEN velocity.txCount1h > 100 THEN REVIEW WEIGHT 0.6 MISSING SKIP
RULE tor_exit WHEN network.isTor == true THEN BLOCK WEIGHT 1.0 MISSING SKIP
RULE vpn_proxy WHEN network.isVpn == true THEN REVIEW WEIGHT 0.5 MISSING SKIP
RULE bot_block WHEN behavioral.isBot == true THEN BLOCK WEIGHT 0.9 MISSING SKIP
RULE geo_mismatch WHEN network.geoMismatchScore > 50 THEN REVIEW WEIGHT 0.6 MISSING SKIP
RULE stateful_repeat_blocker WHEN stateful.customer.previousBlockCount30d > 0 AND stateful.customer.txCount1h > 3 THEN BLOCK WEIGHT 0.9 MISSING SKIP
RULE stateful_device_spread WHEN stateful.device.uniqueIps24h > 10 THEN REVIEW WEIGHT 0.6 MISSING SKIP
RULE stateful_ip_burst WHEN stateful.ip.txCount1h > 50 THEN BLOCK WEIGHT 0.8 MISSING SKIP
RULE graph_fraud_ring WHEN stateful.graph.fraudRingDetected == true THEN BLOCK WEIGHT 1.0 MISSING SKIP
RULE seq_failed_x3_then_success WHEN stateful.customer.failedPaymentX3ThenSuccess10m == true THEN BLOCK WEIGHT 0.9 MISSING SKIP
RULE seq_login_then_payment WHEN stateful.customer.loginThenPayment15m == true THEN REVIEW WEIGHT 0.6 MISSING SKIP
  `.trim()),
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

const mockDeviceSignal: DeviceSignal = {
  deviceId:           'device-001',
  merchantId:         'merchant-001',
  fingerprint:        'fp-001',
  trustScore:         80,
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
    txCount10m:       1,
    txCount1h:        2,
    txCount24h:       8,
    amountSum1h:      100,
    amountSum24h:     400,
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

function makeLowRiskBundle(): SignalBundle {
  return {
    device:     mockDeviceSignal,
    velocity:   mockVelocitySignal,
    behavioral: mockBehavioralSignal,
    network:    mockNetworkSignal,
    telco:      mockTelcoSignal,
    stateful:   null,
  };
}

const mockSignalFetcher = {
  fetchAllSignals: jest.fn().mockResolvedValue(makeLowRiskBundle()),
  fetchDeviceSignal:     jest.fn(),
  fetchVelocitySignal:   jest.fn(),
  fetchBehavioralSignal: jest.fn(),
  fetchNetworkSignal:    jest.fn(),
  fetchTelcoSignal:      jest.fn(),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DecisionOrchestratorService', () => {
  let service: DecisionOrchestratorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDecisionCache.get.mockResolvedValue(null);
    mockDecisionCache.set.mockResolvedValue(undefined);
    mockSignalFetcher.fetchAllSignals.mockResolvedValue(makeLowRiskBundle());
    mockStartSpan.mockReturnValue(mockSpan);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecisionOrchestratorService,
        { provide: ConfigService,  useValue: mockConfigService },
        { provide: SignalFetcher,  useValue: mockSignalFetcher },
        { provide: DecisionCacheService, useValue: mockDecisionCache },
      ],
    }).compile();

    service = module.get<DecisionOrchestratorService>(DecisionOrchestratorService);
    // Trigger rule loading
    service.onModuleInit();
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
      const result = await service.decide(makeRequest());

      expect(result.requestId).toBe('req-001');
      expect(result.merchantId).toBe('merchant-001');
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
      expect(result.action).toBe('ALLOW');
      expect(result.cached).toBe(false);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.riskFactors.length).toBeGreaterThan(0);
    });

    it('calls fetchAllSignals with correct params', async () => {
      await service.decide(makeRequest());

      expect(mockSignalFetcher.fetchAllSignals).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'device-001',
          entityId: 'user-001',
          merchantId: 'merchant-001',
          sessionId: 'session-001',
          ip: '1.2.3.4',
          msisdn: '+905001234567',
        }),
      );
    });

    it('high risk signals → BLOCK', async () => {
      mockSignalFetcher.fetchAllSignals.mockResolvedValue({
        device: { ...mockDeviceSignal, trustScore: 10, isEmulator: true, emulatorConfidence: 0.9 },
        velocity: {
          ...mockVelocitySignal,
          dimensions: { ...mockVelocitySignal.dimensions, txCount1h: 25 },
          burstDetected: true,
          burstRatio: 5,
        },
        behavioral: { ...mockBehavioralSignal, sessionRiskScore: 80, isBot: true },
        network: { ...mockNetworkSignal, isTor: true, riskScore: 90 },
        telco: { ...mockTelcoSignal, isPorted: true, prepaidProbability: 0.9 },
        stateful: null,
      });

      const result = await service.decide(makeRequest());
      expect(result.action).toBe('BLOCK');
      expect(result.riskScore).toBeGreaterThanOrEqual(70);
    });

    it('moderate risk signals → REVIEW', async () => {
      mockSignalFetcher.fetchAllSignals.mockResolvedValue({
        device: { ...mockDeviceSignal, trustScore: 50 },
        velocity: {
          ...mockVelocitySignal,
          dimensions: { ...mockVelocitySignal.dimensions, txCount1h: 8 },
        },
        behavioral: { ...mockBehavioralSignal, sessionRiskScore: 60 },
        network: { ...mockNetworkSignal, isProxy: true, riskScore: 40 },
        telco: { ...mockTelcoSignal, prepaidProbability: 0.3 },
        stateful: null,
      });

      const result = await service.decide(makeRequest());
      expect(result.action).toBe('REVIEW');
      expect(result.riskScore).toBeGreaterThanOrEqual(40);
      expect(result.riskScore).toBeLessThan(70);
    });

    it('all signals null → fallback to REVIEW (score=50)', async () => {
      mockSignalFetcher.fetchAllSignals.mockResolvedValue({
        device: null, velocity: null, behavioral: null,
        network: null, telco: null, stateful: null,
      });

      const result = await service.decide(makeRequest());
      expect(result.riskScore).toBe(50);
      expect(result.action).toBe('REVIEW');
    });

    it('risk factors are populated and sorted by contribution', async () => {
      const result = await service.decide(makeRequest());

      expect(result.riskFactors).toBeInstanceOf(Array);
      expect(result.riskFactors.length).toBeGreaterThan(0);

      for (const factor of result.riskFactors) {
        expect(factor.signal).toBeTruthy();
        expect(factor.description).toBeTruthy();
        expect(typeof factor.contribution).toBe('number');
      }

      for (let i = 0; i < result.riskFactors.length - 1; i++) {
        expect(result.riskFactors[i].contribution).toBeGreaterThanOrEqual(
          result.riskFactors[i + 1].contribution,
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // DSL Rule Evaluation Integration
  // -------------------------------------------------------------------------

  describe('DSL rule evaluation', () => {
    it('loads DSL rules at init', () => {
      expect(service.getParsedRules().length).toBeGreaterThan(0);
    });

    it('emulator DSL rule → BLOCK and emulator_block in appliedRules', async () => {
      mockSignalFetcher.fetchAllSignals.mockResolvedValue({
        device: { ...mockDeviceSignal, isEmulator: true, emulatorConfidence: 0.9, trustScore: 20 },
        velocity: mockVelocitySignal,
        behavioral: mockBehavioralSignal,
        network: mockNetworkSignal,
        telco: mockTelcoSignal,
        stateful: null,
      });

      const result = await service.decide(makeRequest());
      expect(result.appliedRules).toContain('emulator_block');
      expect(result.action).toBe('BLOCK');
    });

    it('Tor exit DSL rule → BLOCK and tor_exit in appliedRules', async () => {
      mockSignalFetcher.fetchAllSignals.mockResolvedValue({
        device: mockDeviceSignal,
        velocity: mockVelocitySignal,
        behavioral: mockBehavioralSignal,
        network: { ...mockNetworkSignal, isTor: true, riskScore: 90 },
        telco: mockTelcoSignal,
        stateful: null,
      });

      const result = await service.decide(makeRequest());
      expect(result.appliedRules).toContain('tor_exit');
      expect(result.action).toBe('BLOCK');
    });

    it('bot DSL rule → BLOCK and bot_block in appliedRules', async () => {
      mockSignalFetcher.fetchAllSignals.mockResolvedValue({
        device: mockDeviceSignal,
        velocity: mockVelocitySignal,
        behavioral: { ...mockBehavioralSignal, isBot: true, sessionRiskScore: 80 },
        network: mockNetworkSignal,
        telco: mockTelcoSignal,
        stateful: null,
      });

      const result = await service.decide(makeRequest());
      expect(result.appliedRules).toContain('bot_block');
      expect(result.action).toBe('BLOCK');
    });

    it('velocity burst DSL rule → REVIEW upgrade for low-risk baseline', async () => {
      mockSignalFetcher.fetchAllSignals.mockResolvedValue({
        device: mockDeviceSignal,
        velocity: { ...mockVelocitySignal, burstDetected: true, burstRatio: 3 },
        behavioral: mockBehavioralSignal,
        network: mockNetworkSignal,
        telco: mockTelcoSignal,
        stateful: null,
      });

      const result = await service.decide(makeRequest());
      expect(result.appliedRules).toContain('velocity_burst');
      // Low risk baseline would be ALLOW, but DSL REVIEW rule upgrades to REVIEW
      expect(['REVIEW', 'BLOCK']).toContain(result.action);
    });

    it('stateful repeat blocker → BLOCK when previous blocks + active tx', async () => {
      mockSignalFetcher.fetchAllSignals.mockResolvedValue({
        device: mockDeviceSignal,
        velocity: mockVelocitySignal,
        behavioral: mockBehavioralSignal,
        network: mockNetworkSignal,
        telco: mockTelcoSignal,
        stateful: {
          customer: {
            previousBlockCount30d: 2,
            txCount1h: 5,
          },
        },
      });

      const result = await service.decide(makeRequest());
      expect(result.appliedRules).toContain('stateful_repeat_blocker');
      expect(result.action).toBe('BLOCK');
    });

    it('graph fraud ring detection → BLOCK', async () => {
      mockSignalFetcher.fetchAllSignals.mockResolvedValue({
        device: mockDeviceSignal,
        velocity: mockVelocitySignal,
        behavioral: mockBehavioralSignal,
        network: mockNetworkSignal,
        telco: mockTelcoSignal,
        stateful: {
          graph: {
            fraudRingDetected: true,
            fraudRingScore: 85,
            sharedDeviceCount: 3,
            sharedIpCount: 2,
          },
        },
      });

      const result = await service.decide(makeRequest());
      expect(result.appliedRules).toContain('graph_fraud_ring');
      expect(result.action).toBe('BLOCK');
    });

    it('sequence detection — failedX3ThenSuccess → BLOCK', async () => {
      mockSignalFetcher.fetchAllSignals.mockResolvedValue({
        device: mockDeviceSignal,
        velocity: mockVelocitySignal,
        behavioral: mockBehavioralSignal,
        network: mockNetworkSignal,
        telco: mockTelcoSignal,
        stateful: {
          customer: {
            failedPaymentX3ThenSuccess10m: true,
          },
        },
      });

      const result = await service.decide(makeRequest());
      expect(result.appliedRules).toContain('seq_failed_x3_then_success');
      expect(result.action).toBe('BLOCK');
    });

    it('sequence detection — loginThenPayment → REVIEW', async () => {
      mockSignalFetcher.fetchAllSignals.mockResolvedValue({
        device: mockDeviceSignal,
        velocity: mockVelocitySignal,
        behavioral: mockBehavioralSignal,
        network: mockNetworkSignal,
        telco: mockTelcoSignal,
        stateful: {
          customer: {
            loginThenPayment15m: true,
          },
        },
      });

      const result = await service.decide(makeRequest());
      expect(result.appliedRules).toContain('seq_login_then_payment');
      // Low risk baseline ALLOW → upgraded to REVIEW by DSL
      expect(['REVIEW', 'BLOCK']).toContain(result.action);
    });

    it('no DSL rules match for clean signals → only threshold-based action', async () => {
      const result = await service.decide(makeRequest());

      // Low risk signals, no stateful context → no DSL rules should match
      // (trustScore=80, no emulator, no burst, no tor, no bot)
      expect(result.appliedRules).toEqual([]);
      expect(result.action).toBe('ALLOW');
    });

    it('DSL evaluation failure → graceful degradation to threshold-based action', async () => {
      // Force DSL evaluation to fail by corrupting parsedRules
      (service as any).parsedRules = [{ type: 'rule', id: 'bad', condition: null, action: 'BLOCK', weight: 1, missingPolicy: 'SKIP' }];

      const result = await service.decide(makeRequest());

      // Should still produce a valid result using threshold-based scoring
      expect(result.action).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
    });

    it('appliedRules only contains matched DSL rule IDs', async () => {
      mockSignalFetcher.fetchAllSignals.mockResolvedValue({
        device: { ...mockDeviceSignal, isEmulator: true, emulatorConfidence: 0.9, trustScore: 15 },
        velocity: mockVelocitySignal,
        behavioral: mockBehavioralSignal,
        network: mockNetworkSignal,
        telco: mockTelcoSignal,
        stateful: null,
      });

      const result = await service.decide(makeRequest());
      // Should contain emulator_block and very_low_trust (trustScore=15 < 20)
      expect(result.appliedRules).toContain('emulator_block');
      expect(result.appliedRules).toContain('very_low_trust');
      // Should NOT contain rules that didn't match
      expect(result.appliedRules).not.toContain('tor_exit');
      expect(result.appliedRules).not.toContain('bot_block');
    });
  });

  // -------------------------------------------------------------------------
  // composeSignalContext (unit)
  // -------------------------------------------------------------------------

  describe('composeSignalContext', () => {
    it('flattens velocity dimensions to top-level', () => {
      const bundle: SignalBundle = {
        device: null,
        velocity: mockVelocitySignal,
        behavioral: null,
        network: null,
        telco: null,
        stateful: null,
      };

      const ctx = service.composeSignalContext(bundle);
      // velocity.txCount1h should be at top level for DSL resolution
      expect((ctx.velocity as any).txCount1h).toBe(2);
      expect((ctx.velocity as any).burstDetected).toBe(false);
    });

    it('passes stateful context through', () => {
      const bundle: SignalBundle = {
        device: null, velocity: null, behavioral: null,
        network: null, telco: null,
        stateful: {
          customer: { previousBlockCount30d: 3, txCount1h: 10 },
          graph: { fraudRingDetected: true, fraudRingScore: 90, sharedDeviceCount: 5, sharedIpCount: 3 },
        },
      };

      const ctx = service.composeSignalContext(bundle);
      expect(ctx.stateful?.customer?.previousBlockCount30d).toBe(3);
      expect(ctx.stateful?.graph?.fraudRingDetected).toBe(true);
    });

    it('handles all-null bundle gracefully', () => {
      const bundle: SignalBundle = {
        device: null, velocity: null, behavioral: null,
        network: null, telco: null, stateful: null,
      };

      const ctx = service.composeSignalContext(bundle);
      expect(ctx.device).toBeUndefined();
      expect(ctx.velocity).toBeUndefined();
      expect(ctx.stateful).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Decision cache integration
  // -------------------------------------------------------------------------

  describe('decision cache integration', () => {
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
      expect(mockSignalFetcher.fetchAllSignals).not.toHaveBeenCalled();
    });

    it('stores result in cache after a fresh decision', async () => {
      mockDecisionCache.get.mockResolvedValue(null);

      await service.decide(makeRequest());

      expect(mockDecisionCache.set).toHaveBeenCalledWith(
        'merchant-001',
        'user-001',
        expect.objectContaining({ action: expect.any(String), riskScore: expect.any(Number) }),
      );
    });

    it('checks cache with correct merchantId and entityId', async () => {
      mockDecisionCache.get.mockResolvedValue(null);

      await service.decide(makeRequest({ merchantId: 'merch-x', entityId: 'ent-y' }));

      expect(mockDecisionCache.get).toHaveBeenCalledWith('merch-x', 'ent-y');
    });
  });

  // -------------------------------------------------------------------------
  // Span instrumentation
  // -------------------------------------------------------------------------

  describe('span instrumentation', () => {
    it('creates a span for fetchAllSignals', async () => {
      await service.decide(makeRequest());

      const allCalls = mockStartSpan.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
      const spanCall = allCalls.find((call) => call[0] === 'fetch.all-signals');
      expect(spanCall).toBeDefined();
    });

    it('calls span.end() after fetch completes', async () => {
      await service.decide(makeRequest());
      expect(mockSpanEnd).toHaveBeenCalled();
    });
  });
});
