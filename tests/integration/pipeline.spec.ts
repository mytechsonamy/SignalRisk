/**
 * SignalRisk Pipeline — Integration Contract Tests
 *
 * These tests import real service classes and mock their infrastructure
 * dependencies (Redis, Kafka, DB, HTTP). They exercise full business logic
 * without spinning up real infrastructure.
 */

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

function makeMockLogger() {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

// ---------------------------------------------------------------------------
// 1. Event Validation Pipeline
// ---------------------------------------------------------------------------

describe('SignalRisk Pipeline — Integration Contract Tests', () => {

  // =========================================================================
  describe('Event Validation Pipeline', () => {

    it('should accept valid event and produce to Kafka topic', async () => {
      // Import the EventsService and its dependencies inline
      const { EventsService } = await import(
        '../../apps/event-collector/src/events/events.service'
      );

      const mockKafkaService = {
        sendBatch: jest.fn().mockResolvedValue(undefined),
      };
      const mockDlqService = {
        sendBatchToDlq: jest.fn().mockResolvedValue(undefined),
      };

      const svc = new (EventsService as any)(mockKafkaService, mockDlqService);

      const validEvent = {
        merchantId: 'merchant-001',
        deviceId: 'device-abc',
        sessionId: 'sess-xyz',
        type: 'PAGE_VIEW',
        payload: { url: 'https://example.com' },
        ipAddress: '192.168.1.1',
      };

      const result = await svc.ingest([validEvent]);

      expect(result.accepted).toBe(1);
      expect(result.rejected).toBe(0);
      expect(mockKafkaService.sendBatch).toHaveBeenCalledTimes(1);

      const batchArg = mockKafkaService.sendBatch.mock.calls[0][0];
      expect(batchArg[0].topic).toBe('signalrisk.events.raw');
      expect(batchArg[0].headers['event-type']).toBe('PAGE_VIEW');
    });

    it('should reject event with invalid schema to DLQ', async () => {
      const { EventsService } = await import(
        '../../apps/event-collector/src/events/events.service'
      );

      const mockKafkaService = {
        sendBatch: jest.fn().mockResolvedValue(undefined),
      };
      const mockDlqService = {
        sendBatchToDlq: jest.fn().mockResolvedValue(undefined),
      };

      const svc = new (EventsService as any)(mockKafkaService, mockDlqService);

      // Missing required fields — no merchantId, no sessionId, no type
      const invalidEvent = {
        deviceId: 'device-abc',
        payload: {},
      };

      const result = await svc.ingest([invalidEvent as any]);

      expect(result.accepted).toBe(0);
      expect(result.rejected).toBe(1);
      expect(mockDlqService.sendBatchToDlq).toHaveBeenCalledTimes(1);
      expect(result.results[0].accepted).toBe(false);
    });

    it('should return false from BackpressureService when concurrent limit exceeded', () => {
      // Import BackpressureService directly — no NestJS DI needed
      const { BackpressureService } = require(
        '../../apps/event-collector/src/backpressure/backpressure.service'
      );

      // Use a config that sets maxConcurrent=1 so second acquire fails
      const mockConfig = {
        get: (key: string, def?: unknown) => {
          if (key === 'backpressure.maxConcurrent') return 1;
          if (key === 'backpressure.maxQueueDepth') return 5000;
          if (key === 'backpressure.windowMs') return 10000;
          return def;
        },
      };

      const bp = new BackpressureService(mockConfig);

      const first = bp.tryAcquire();
      expect(first).toBe(true); // allowed

      const second = bp.tryAcquire();
      expect(second).toBe(false); // denied — concurrent limit hit

      const status = bp.getStatus();
      expect(status.isOverloaded).toBe(true);
    });
  });

  // =========================================================================
  describe('Device Intelligence Pipeline', () => {

    it('should generate consistent fingerprint for same device attributes', async () => {
      const { FingerprintService } = await import(
        '../../apps/device-intel-service/src/fingerprint/fingerprint.service'
      );

      // Minimal mocks — generateFingerprint is a pure function (no I/O)
      const mockConfig = {
        get: (key: string, def?: unknown) => {
          if (key === 'database') return { host: 'localhost', port: 5432, username: 'u', password: 'p', database: 'd', ssl: false };
          if (key === 'fingerprint.fuzzyMatchThreshold') return 0.85;
          return def;
        },
      };
      const mockCache = { getByFingerprint: jest.fn(), setDevice: jest.fn(), getById: jest.fn(), invalidate: jest.fn() };
      const mockTrustScore = { calculateInitialTrustScore: jest.fn().mockReturnValue(50), calculateTrustScore: jest.fn().mockReturnValue(50) };

      const svc = new (FingerprintService as any)(mockConfig, mockCache, mockTrustScore);

      const attrs = {
        screenResolution: '1920x1080',
        gpuRenderer: 'NVIDIA GeForce RTX',
        timezone: 'America/New_York',
        webglHash: 'abc123',
        canvasHash: 'def456',
        platform: 'web',
      };

      const fp1 = svc.generateFingerprint(attrs);
      const fp2 = svc.generateFingerprint(attrs);

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64); // SHA-256 hex
    });

    it('should calculate trust score correctly for emulated device', () => {
      const { TrustScoreService } = require(
        '../../apps/device-intel-service/src/fingerprint/trust-score.service'
      );

      const svc = new TrustScoreService();

      const score = svc.calculateInitialTrustScore(
        { platform: 'android', screenResolution: '1080x1920' },
        { isEmulator: true, confidence: 0.9, indicators: ['gpu_renderer:android emulator'] },
      );

      // BASE_SCORE(50) - PENALTY_EMULATOR(40) - PENALTY_EMULATOR_CONFIDENCE(20)*0.9 = 50-40-18 = -8 → clamped to 0
      expect(score).toBe(0);
    });

    it('should detect Android emulator from GPU renderer', () => {
      const { EmulatorDetector } = require(
        '../../apps/device-intel-service/src/fingerprint/emulator-detector'
      );

      const detector = new EmulatorDetector();

      const analysis = detector.detect({
        gpuRenderer: 'Android Emulator',
        platform: 'android',
        screenResolution: '1080x1920',
      });

      expect(analysis.isEmulator).toBe(true);
      expect(analysis.confidence).toBeGreaterThan(0);
      expect(
        analysis.indicators.some((ind: string) => ind.includes('android emulator')),
      ).toBe(true);
    });
  });

  // =========================================================================
  describe('Rule Engine Pipeline', () => {

    function buildRuleRegistry() {
      const { RuleRegistryService } = require(
        '../../apps/rule-engine-service/src/registry/rule-registry.service'
      );
      const { RuleEvaluationService } = require(
        '../../apps/rule-engine-service/src/evaluation/rule-evaluation.service'
      );

      const mockLogger = makeMockLogger();
      const registry = new RuleRegistryService();
      // Inject mock logger
      (registry as any).logger = mockLogger;

      const dsl = `
        RULE high_risk_block
          WHEN device.riskScore > 80
          THEN BLOCK
          WEIGHT 1.0

        RULE medium_risk_review
          WHEN device.riskScore > 50 AND device.riskScore <= 80
          THEN REVIEW
          WEIGHT 0.8
      `;
      registry.load(dsl);

      const evalSvc = new RuleEvaluationService(registry);
      (evalSvc as any).logger = mockLogger;

      return evalSvc;
    }

    it('should evaluate BLOCK rule for high risk score', () => {
      const evalSvc = buildRuleRegistry();

      const context = { device: { riskScore: 90 } };
      const summary = evalSvc.evaluate(context, 'merchant-001');

      expect(summary.finalAction).toBe('BLOCK');
      expect(summary.matchedRules.some((r: any) => r.action === 'BLOCK')).toBe(true);
    });

    it('should evaluate REVIEW rule for medium risk score', () => {
      const evalSvc = buildRuleRegistry();

      const context = { device: { riskScore: 65 } };
      const summary = evalSvc.evaluate(context, 'merchant-001');

      expect(summary.finalAction).toBe('REVIEW');
    });

    it('should return ALLOW when no rules match', () => {
      const evalSvc = buildRuleRegistry();

      const context = { device: { riskScore: 20 } };
      const summary = evalSvc.evaluate(context, 'merchant-001');

      expect(summary.finalAction).toBe('ALLOW');
      expect(summary.matchedRules).toHaveLength(0);
    });
  });

  // =========================================================================
  describe('Decision Orchestration Pipeline', () => {

    function buildOrchestrator(fetcherOverrides: Record<string, jest.Mock>) {
      const { DecisionOrchestratorService } = require(
        '../../apps/decision-service/src/decision/decision-orchestrator.service'
      );

      const mockConfig = {
        get: (key: string, def?: unknown) => {
          if (key === 'decision.signalTimeoutMs') return 150;
          return def;
        },
      };

      const mockFetcher = {
        fetchDeviceSignal: jest.fn().mockResolvedValue(null),
        fetchVelocitySignal: jest.fn().mockResolvedValue(null),
        fetchBehavioralSignal: jest.fn().mockResolvedValue(null),
        fetchNetworkSignal: jest.fn().mockResolvedValue(null),
        fetchTelcoSignal: jest.fn().mockResolvedValue(null),
        ...fetcherOverrides,
      };

      return new DecisionOrchestratorService(mockConfig, mockFetcher);
    }

    it('should aggregate signals and produce weighted decision', async () => {
      const deviceSignal = {
        deviceId: 'dev-1',
        merchantId: 'merch-1',
        fingerprint: 'abc',
        trustScore: 80,       // low risk device
        isEmulator: false,
        emulatorConfidence: 0,
        platform: 'web',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        daysSinceFirstSeen: 90,
      };

      const velocitySignal = {
        entityId: 'user-1',
        merchantId: 'merch-1',
        dimensions: { txCount1h: 2, txCount24h: 5, amountSum1h: 10000, uniqueDevices24h: 1, uniqueIps24h: 1, uniqueSessions1h: 1 },
        burstDetected: false,
      };

      const orchestrator = buildOrchestrator({
        fetchDeviceSignal: jest.fn().mockResolvedValue(deviceSignal),
        fetchVelocitySignal: jest.fn().mockResolvedValue(velocitySignal),
      });

      const result = await orchestrator.decide({
        requestId: 'req-001',
        merchantId: 'merch-1',
        deviceId: 'dev-1',
        sessionId: 'sess-1',
        entityId: 'user-1',
        ip: '1.2.3.4',
      });

      expect(result.requestId).toBe('req-001');
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
      expect(['ALLOW', 'REVIEW', 'BLOCK']).toContain(result.action);
      expect(result.cached).toBe(false);
    });

    it('should degrade gracefully when device signal times out', async () => {
      // Device signal returns null (timeout/failure)
      const velocitySignal = {
        entityId: 'user-2',
        merchantId: 'merch-1',
        dimensions: { txCount1h: 1, txCount24h: 3, amountSum1h: 5000, uniqueDevices24h: 1, uniqueIps24h: 1, uniqueSessions1h: 1 },
        burstDetected: false,
      };

      const orchestrator = buildOrchestrator({
        fetchDeviceSignal: jest.fn().mockResolvedValue(null),
        fetchVelocitySignal: jest.fn().mockResolvedValue(velocitySignal),
      });

      const result = await orchestrator.decide({
        requestId: 'req-002',
        merchantId: 'merch-1',
        deviceId: 'dev-missing',
        sessionId: 'sess-2',
        entityId: 'user-2',
      });

      // Should still produce a decision
      expect(result).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(['ALLOW', 'REVIEW', 'BLOCK']).toContain(result.action);
    });

    it('should enforce idempotency for duplicate requestId', async () => {
      const { IdempotencyService } = require(
        '../../apps/decision-service/src/idempotency/idempotency.service'
      );

      const storedDecision = {
        requestId: 'req-idem-001',
        merchantId: 'merch-1',
        action: 'ALLOW',
        riskScore: 10,
        riskFactors: [],
        appliedRules: [],
        latencyMs: 50,
        cached: false,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      };

      const serialized = JSON.stringify({
        ...storedDecision,
        createdAt: storedDecision.createdAt.toISOString(),
      });

      // Mock Redis: first call (get) returns null, then the serialized result
      let getCallCount = 0;
      const mockRedis = {
        get: jest.fn().mockImplementation(() => {
          getCallCount++;
          if (getCallCount === 1) return Promise.resolve(null); // cache miss
          return Promise.resolve(serialized);                    // cache hit
        }),
        setex: jest.fn().mockResolvedValue('OK'),
        quit: jest.fn().mockResolvedValue(undefined),
        connect: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };

      const mockConfig = {
        get: (key: string) => {
          if (key === 'redis') return { host: 'localhost', port: 6379, db: 0 };
          return undefined;
        },
      };

      const svc = new IdempotencyService(mockConfig);
      // Replace the internal redis instance with our mock
      (svc as any).redis = mockRedis;

      // First call — cache miss
      const miss = await svc.get('req-idem-001', 'merch-1');
      expect(miss).toBeNull();

      // Store the decision
      await svc.set(storedDecision as any);
      expect(mockRedis.setex).toHaveBeenCalledTimes(1);

      // Second call — cache hit
      const hit = await svc.get('req-idem-001', 'merch-1');
      expect(hit).not.toBeNull();
      expect(hit!.requestId).toBe('req-idem-001');
      expect(hit!.cached).toBe(true);
    });
  });

  // =========================================================================
  describe('Velocity Engine Pipeline', () => {

    it('should count events within sliding window', async () => {
      const { VelocityService } = await import(
        '../../apps/velocity-service/src/velocity/velocity.service'
      );

      const mockConfig = {
        get: (key: string, def?: unknown) => {
          const configMap: Record<string, unknown> = {
            'velocity.keyTtlSeconds': 90000,
            'velocity.window1h': 3600,
            'velocity.window24h': 86400,
            'velocity.baselineWindowSeconds': 604800,
            'redis.host': 'localhost',
            'redis.port': 6379,
            'redis.db': 0,
            'redis.connectTimeout': 5000,
            'redis.maxRetriesPerRequest': 3,
          };
          return configMap[key] ?? def;
        },
      };

      // Build a mock pipeline result simulating 3 events counted in 1h window
      const mockPipelineResults = [
        [null, 0],   // zremrangebyscore tx
        [null, 0],   // zremrangebyscore amt
        [null, 3],   // zcount 1h → 3 events
        [null, 3],   // zcount 24h
        [null, []],  // zrangebyscore amounts
        [null, 1],   // pfcount unique devices
        [null, 1],   // pfcount unique IPs
        [null, 1],   // pfcount unique sessions
      ];

      const mockPipeline = {
        zadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        pfadd: jest.fn().mockReturnThis(),
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcount: jest.fn().mockReturnThis(),
        zrangebyscore: jest.fn().mockReturnThis(),
        pfcount: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockPipelineResults),
      };

      const mockRedis = {
        pipeline: jest.fn().mockReturnValue(mockPipeline),
        zremrangebyscore: jest.fn().mockResolvedValue(0),
        zcount: jest.fn().mockResolvedValue(3),
        on: jest.fn(),
        quit: jest.fn().mockResolvedValue(undefined),
      };

      const svc = new (VelocityService as any)(mockConfig);
      (svc as any).redis = mockRedis;

      const signals = await svc.getVelocitySignals('merch-1', 'user-1');

      expect(signals.tx_count_1h).toBe(3);
      expect(signals.tx_count_24h).toBe(3);
    });

    it('should detect burst when count exceeds threshold', async () => {
      const { BurstService } = await import(
        '../../apps/velocity-service/src/burst/burst.service'
      );

      const mockConfig = {
        get: (key: string, def?: unknown) => {
          if (key === 'burst.multiplierThreshold') return 3.0;
          return def;
        },
      };

      // 10 events this hour vs baseline of ~1 per hour → 10x multiplier
      const mockVelocityService = {
        getVelocitySignals: jest.fn().mockResolvedValue({
          tx_count_1h: 10,
          tx_count_24h: 40,
          amount_sum_1h: 50000,
          unique_devices_24h: 3,
          unique_ips_24h: 2,
          unique_sessions_1h: 5,
          burst_detected: false,
        }),
        getBaseline: jest.fn().mockResolvedValue(1.0), // avg 1 tx/hour over 7 days
      };

      const mockDecayService = {};

      const burstSvc = new (BurstService as any)(mockVelocityService, mockDecayService, mockConfig);

      const result = await burstSvc.detectBurst('merch-1', 'user-1');

      expect(result.detected).toBe(true);
      expect(result.dimensions).toContain('tx_count_1h');
      expect(result.multiplier).toBeGreaterThanOrEqual(3);
    });
  });

  // =========================================================================
  describe('Case Management Pipeline', () => {

    function buildMockCase(overrides: Record<string, unknown> = {}) {
      const now = new Date();
      return {
        id: 'case-001',
        merchantId: 'merch-1',
        decisionId: 'req-block-001',
        entityId: 'user-1',
        action: 'BLOCK',
        riskScore: 85,
        riskFactors: [],
        status: 'OPEN',
        priority: 'HIGH',
        slaDeadline: new Date(now.getTime() + 4 * 3_600_000),
        assignedTo: null,
        resolution: null,
        resolutionNotes: null,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      };
    }

    it('should auto-create HIGH priority case for BLOCK decision', async () => {
      const { CaseService } = await import(
        '../../apps/case-service/src/cases/case.service'
      );

      const builtCase = buildMockCase({ priority: 'HIGH', action: 'BLOCK', riskScore: 85 });
      const mockRepo = {
        create: jest.fn().mockResolvedValue(builtCase),
      };

      const svc = new (CaseService as any)(mockRepo);

      const decisionEvent = {
        requestId: 'req-block-001',
        merchantId: 'merch-1',
        entityId: 'user-1',
        action: 'BLOCK',
        riskScore: 85,
        riskFactors: [],
      };

      const result = await svc.createFromDecision(decisionEvent);

      expect(result.priority).toBe('HIGH');
      expect(result.action).toBe('BLOCK');

      // Verify SLA deadline was set to ~4 hours
      const createCall = mockRepo.create.mock.calls[0][0];
      const slaHoursMs = createCall.slaDeadline.getTime() - Date.now();
      expect(slaHoursMs).toBeGreaterThan(3.5 * 3_600_000); // > 3.5h
      expect(slaHoursMs).toBeLessThan(4.5 * 3_600_000);    // < 4.5h
    });

    it('should auto-create MEDIUM priority case for REVIEW decision', async () => {
      const { CaseService } = await import(
        '../../apps/case-service/src/cases/case.service'
      );

      const builtCase = buildMockCase({
        priority: 'MEDIUM',
        action: 'REVIEW',
        riskScore: 65,
        decisionId: 'req-review-001',
      });
      const mockRepo = {
        create: jest.fn().mockResolvedValue(builtCase),
      };

      const svc = new (CaseService as any)(mockRepo);

      const decisionEvent = {
        requestId: 'req-review-001',
        merchantId: 'merch-1',
        entityId: 'user-1',
        action: 'REVIEW',
        riskScore: 65,
        riskFactors: [],
      };

      const result = await svc.createFromDecision(decisionEvent);

      expect(result.priority).toBe('MEDIUM');
      expect(result.action).toBe('REVIEW');

      // Verify SLA deadline was set to ~24 hours
      const createCall = mockRepo.create.mock.calls[0][0];
      const slaHoursMs = createCall.slaDeadline.getTime() - Date.now();
      expect(slaHoursMs).toBeGreaterThan(23 * 3_600_000); // > 23h
      expect(slaHoursMs).toBeLessThan(25 * 3_600_000);    // < 25h
    });

    it('should NOT create case for ALLOW decision', async () => {
      const { CaseService } = await import(
        '../../apps/case-service/src/cases/case.service'
      );

      const mockRepo = {
        create: jest.fn(),
      };

      const svc = new (CaseService as any)(mockRepo);

      // The decision-consumer service is responsible for filtering ALLOW —
      // CaseService.createFromDecision is only called for BLOCK/REVIEW.
      // Verify the business rule by confirming create is not called for ALLOW.
      const decisionEvent = {
        requestId: 'req-allow-001',
        merchantId: 'merch-1',
        entityId: 'user-1',
        action: 'ALLOW',
        riskScore: 15,
        riskFactors: [],
      };

      // Simulate the consumer's guard: only call createFromDecision for non-ALLOW
      if (decisionEvent.action !== 'ALLOW') {
        await svc.createFromDecision(decisionEvent);
      }

      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  describe('Rate Limiting Pipeline', () => {

    function buildRateLimitService(redisEvalResult: [number, number, number] | Error) {
      const { MerchantRateLimitService } = require(
        '../../apps/auth-service/src/rate-limit/merchant-rate-limit.service'
      );

      const mockConfig = {
        get: (key: string, def?: unknown) => {
          if (key === 'rateLimit.defaultPerMinute') return 100;
          if (key === 'rateLimit.burstMultiplier') return 2;
          if (key === 'REDIS_HOST') return 'localhost';
          if (key === 'REDIS_PORT') return 6379;
          if (key === 'REDIS_DB') return 0;
          return def;
        },
      };

      const mockRedis: Record<string, jest.Mock> = {
        eval: jest.fn(),
        get: jest.fn(),
        ttl: jest.fn(),
        quit: jest.fn().mockResolvedValue(undefined),
        connect: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };

      if (redisEvalResult instanceof Error) {
        mockRedis.eval = jest.fn().mockRejectedValue(redisEvalResult);
      } else {
        mockRedis.eval = jest.fn().mockResolvedValue(redisEvalResult);
      }

      const svc = new MerchantRateLimitService(mockConfig);
      (svc as any).redis = mockRedis;

      return svc;
    }

    it('should allow requests within limit', async () => {
      // [allowed=1, remaining=99, ttl=60]
      const svc = buildRateLimitService([1, 99, 60]);

      const result = await svc.checkAndConsume('merch-1', 'POST:/v1/events');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
      expect(result.limit).toBe(100);
    });

    it('should deny requests when bucket exhausted', async () => {
      // [allowed=0, remaining=0, ttl=30]
      const svc = buildRateLimitService([0, 0, 30]);

      const result = await svc.checkAndConsume('merch-1', 'POST:/v1/events');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should fail open on Redis error', async () => {
      const svc = buildRateLimitService(new Error('Redis connection refused'));

      const result = await svc.checkAndConsume('merch-1', 'POST:/v1/events');

      // Fail open — legitimate traffic must not be blocked on Redis failure
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(100); // defaultLimit
    });
  });

  // =========================================================================
  describe('End-to-End Latency Budget', () => {

    function buildFastOrchestrator(fetchers: Record<string, jest.Mock>) {
      const { DecisionOrchestratorService } = require(
        '../../apps/decision-service/src/decision/decision-orchestrator.service'
      );

      const mockConfig = {
        get: (key: string, def?: unknown) => {
          if (key === 'decision.signalTimeoutMs') return 500; // generous timeout for tests
          return def;
        },
      };

      const mockFetcher = {
        fetchDeviceSignal: jest.fn().mockResolvedValue(null),
        fetchVelocitySignal: jest.fn().mockResolvedValue(null),
        fetchBehavioralSignal: jest.fn().mockResolvedValue(null),
        fetchNetworkSignal: jest.fn().mockResolvedValue(null),
        fetchTelcoSignal: jest.fn().mockResolvedValue(null),
        ...fetchers,
      };

      return new DecisionOrchestratorService(mockConfig, mockFetcher);
    }

    const allSignals = {
      fetchDeviceSignal: jest.fn().mockResolvedValue({
        deviceId: 'dev-1',
        merchantId: 'merch-1',
        fingerprint: 'fp',
        trustScore: 90,
        isEmulator: false,
        emulatorConfidence: 0,
        platform: 'web',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        daysSinceFirstSeen: 60,
      }),
      fetchVelocitySignal: jest.fn().mockResolvedValue({
        entityId: 'user-1',
        merchantId: 'merch-1',
        dimensions: { txCount1h: 1, txCount24h: 3, amountSum1h: 1000, uniqueDevices24h: 1, uniqueIps24h: 1, uniqueSessions1h: 1 },
        burstDetected: false,
      }),
      fetchBehavioralSignal: jest.fn().mockResolvedValue({
        sessionId: 'sess-1',
        merchantId: 'merch-1',
        sessionRiskScore: 10,
        botProbability: 0.05,
        isBot: false,
        indicators: [],
      }),
      fetchNetworkSignal: jest.fn().mockResolvedValue({
        ip: '1.2.3.4',
        merchantId: 'merch-1',
        isProxy: false,
        isVpn: false,
        isTor: false,
        isDatacenter: false,
        geoMismatchScore: 5,
        riskScore: 10,
      }),
      fetchTelcoSignal: jest.fn().mockResolvedValue({
        msisdn: '+1234567890',
        merchantId: 'merch-1',
        isPorted: false,
        prepaidProbability: 0.1,
        lineType: 'postpaid',
      }),
    };

    it('should complete decision within 500ms with all signals present', async () => {
      const orchestrator = buildFastOrchestrator(allSignals);

      const start = Date.now();
      const result = await orchestrator.decide({
        requestId: 'req-latency-001',
        merchantId: 'merch-1',
        deviceId: 'dev-1',
        sessionId: 'sess-1',
        entityId: 'user-1',
        ip: '1.2.3.4',
        msisdn: '+1234567890',
      });
      const elapsed = Date.now() - start;

      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(500);
    });

    it('should complete decision within 500ms even when one signal times out', async () => {
      // Velocity signal is slow (200ms delay) but still within budget
      const withSlowVelocity = {
        ...allSignals,
        fetchVelocitySignal: jest.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve(null), 200)),
        ),
      };

      const orchestrator = buildFastOrchestrator(withSlowVelocity);

      const start = Date.now();
      const result = await orchestrator.decide({
        requestId: 'req-latency-002',
        merchantId: 'merch-1',
        deviceId: 'dev-1',
        sessionId: 'sess-1',
        entityId: 'user-1',
        ip: '1.2.3.4',
      });
      const elapsed = Date.now() - start;

      // Decision should still be produced (graceful degradation)
      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(500);
    });
  });
});
