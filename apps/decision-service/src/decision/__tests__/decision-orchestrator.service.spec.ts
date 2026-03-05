import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DecisionOrchestratorService } from '../decision-orchestrator.service';
import { DecisionRequest } from '../decision.types';
import * as fetchers from '../signal-fetchers';

// ---------------------------------------------------------------------------
// Mock signal fetchers
// ---------------------------------------------------------------------------

jest.mock('../signal-fetchers', () => ({
  fetchDeviceSignal:    jest.fn(),
  fetchVelocitySignal:  jest.fn(),
  fetchBehavioralSignal: jest.fn(),
  fetchNetworkSignal:   jest.fn(),
  fetchTelcoSignal:     jest.fn(),
}));

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      'decision.signalTimeoutMs': 150,
    };
    return config[key];
  }),
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

const mockDeviceSignal: fetchers.DeviceSignal = {
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

const mockVelocitySignal: fetchers.VelocitySignal = {
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

const mockBehavioralSignal: fetchers.BehavioralSignal = {
  sessionId:        'session-001',
  merchantId:       'merchant-001',
  sessionRiskScore: 10,
  botProbability:   0.02,
  isBot:            false,
  indicators:       [],
};

const mockNetworkSignal: fetchers.NetworkSignal = {
  ip:               '1.2.3.4',
  merchantId:       'merchant-001',
  isProxy:          false,
  isVpn:            false,
  isTor:            false,
  isDatacenter:     false,
  geoMismatchScore: 0,
  riskScore:        5,
};

const mockTelcoSignal: fetchers.TelcoSignal = {
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
  (fetchers.fetchDeviceSignal    as jest.Mock).mockResolvedValue(mockDeviceSignal);
  (fetchers.fetchVelocitySignal  as jest.Mock).mockResolvedValue(mockVelocitySignal);
  (fetchers.fetchBehavioralSignal as jest.Mock).mockResolvedValue(mockBehavioralSignal);
  (fetchers.fetchNetworkSignal   as jest.Mock).mockResolvedValue(mockNetworkSignal);
  (fetchers.fetchTelcoSignal     as jest.Mock).mockResolvedValue(mockTelcoSignal);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DecisionOrchestratorService', () => {
  let service: DecisionOrchestratorService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecisionOrchestratorService,
        { provide: ConfigService, useValue: mockConfigService },
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
      (fetchers.fetchDeviceSignal as jest.Mock).mockResolvedValue({
        ...mockDeviceSignal,
        trustScore: 10,     // deviceRisk = 90
        isEmulator: false,
      });
      (fetchers.fetchVelocitySignal  as jest.Mock).mockResolvedValue({
        ...mockVelocitySignal,
        dimensions: { ...mockVelocitySignal.dimensions, txCount1h: 25 }, // +50
        burstDetected: true,
        burstRatio: 5,
      });
      (fetchers.fetchBehavioralSignal as jest.Mock).mockResolvedValue({
        ...mockBehavioralSignal,
        sessionRiskScore: 80,
        isBot: true,
      });
      (fetchers.fetchNetworkSignal as jest.Mock).mockResolvedValue({
        ...mockNetworkSignal,
        isTor: true,
        riskScore: 90,
      });
      (fetchers.fetchTelcoSignal as jest.Mock).mockResolvedValue({
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
      (fetchers.fetchDeviceSignal as jest.Mock).mockResolvedValue({
        ...mockDeviceSignal,
        trustScore: 50,  // deviceRisk = 50
      });
      (fetchers.fetchVelocitySignal as jest.Mock).mockResolvedValue({
        ...mockVelocitySignal,
        dimensions: { ...mockVelocitySignal.dimensions, txCount1h: 8 }, // +10
      });
      (fetchers.fetchBehavioralSignal as jest.Mock).mockResolvedValue({
        ...mockBehavioralSignal,
        sessionRiskScore: 60,
      });
      (fetchers.fetchNetworkSignal as jest.Mock).mockResolvedValue({
        ...mockNetworkSignal,
        isProxy: true,
        riskScore: 40,
      });
      (fetchers.fetchTelcoSignal as jest.Mock).mockResolvedValue({
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
      (fetchers.fetchDeviceSignal as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockDeviceSignal), 200)),
      );
      (fetchers.fetchVelocitySignal  as jest.Mock).mockResolvedValue(mockVelocitySignal);
      (fetchers.fetchBehavioralSignal as jest.Mock).mockResolvedValue(mockBehavioralSignal);
      (fetchers.fetchNetworkSignal   as jest.Mock).mockResolvedValue(mockNetworkSignal);
      (fetchers.fetchTelcoSignal     as jest.Mock).mockResolvedValue(mockTelcoSignal);

      const result = await service.decide(makeRequest());

      // Score should still be computed (device is excluded)
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
      // Risk factors should not include device signal
      const deviceFactor = result.riskFactors.find((f) => f.signal === 'device.trustScore');
      expect(deviceFactor).toBeUndefined();
    }, 1000);

    it('all signals fail → fallback to REVIEW (score=50)', async () => {
      (fetchers.fetchDeviceSignal    as jest.Mock).mockRejectedValue(new Error('timeout'));
      (fetchers.fetchVelocitySignal  as jest.Mock).mockRejectedValue(new Error('timeout'));
      (fetchers.fetchBehavioralSignal as jest.Mock).mockRejectedValue(new Error('timeout'));
      (fetchers.fetchNetworkSignal   as jest.Mock).mockRejectedValue(new Error('timeout'));
      (fetchers.fetchTelcoSignal     as jest.Mock).mockRejectedValue(new Error('timeout'));

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
      (fetchers.fetchDeviceSignal as jest.Mock).mockResolvedValue({
        ...mockDeviceSignal,
        isEmulator: true,
        emulatorConfidence: 0.9,
        trustScore: 20,
      });
      (fetchers.fetchVelocitySignal  as jest.Mock).mockResolvedValue(mockVelocitySignal);
      (fetchers.fetchBehavioralSignal as jest.Mock).mockResolvedValue(mockBehavioralSignal);
      (fetchers.fetchNetworkSignal   as jest.Mock).mockResolvedValue(mockNetworkSignal);
      (fetchers.fetchTelcoSignal     as jest.Mock).mockResolvedValue(mockTelcoSignal);

      const result = await service.decide(makeRequest());

      expect(result.appliedRules).toContain('rule:emulator-detected');
    });
  });
});
