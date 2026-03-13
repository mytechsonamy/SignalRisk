/**
 * SignalRisk Decision Service — Decision Orchestrator
 *
 * Orchestrates all intelligence signals via fetchAllSignals() (6 parallel fetches),
 * aggregates weighted risk scores, evaluates DSL rules, and produces a final
 * ALLOW/REVIEW/BLOCK decision.
 *
 * Signal weights:
 *   device:    0.35
 *   velocity:  0.25
 *   behavioral: 0.20
 *   network:   0.15
 *   telco:     0.05
 *
 * Action thresholds:
 *   riskScore >= 70  → BLOCK
 *   riskScore >= 40  → REVIEW
 *   riskScore <  40  → ALLOW
 *
 * DSL rule override (Strategy A):
 *   - Weighted score computed first
 *   - DSL rules evaluated against full SignalContext (including stateful)
 *   - Any DSL BLOCK match → final action = BLOCK
 *   - Any DSL REVIEW match + current ALLOW → upgrade to REVIEW
 *   - No DSL match → threshold-based action stands
 */

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { recordDecision, recordError } from '@signalrisk/telemetry';
import * as fs from 'fs';
import * as path from 'path';
import {
  DecisionRequest,
  DecisionResult,
  DecisionAction,
  RiskFactor,
} from './decision.types';
import {
  DeviceSignal,
  VelocitySignal,
  BehavioralSignal,
  NetworkSignal,
  TelcoSignal,
  SignalFetcher,
  SignalBundle,
  PriorDecisionMemory,
} from './signal-fetchers';
import { DecisionGateway, DecisionBroadcastEvent } from './decision.gateway';
import { DecisionCacheService } from './decision-cache.service';
import { DecisionStoreService } from './decision-store.service';
import { WatchlistService } from '../feedback/watchlist.service';

// DSL rule engine — pure TypeScript, no NestJS deps
import { RuleNode } from '../../../rule-engine-service/src/dsl/ast';
import { RuleEvaluator, SignalContext, EvaluationResult } from '../../../rule-engine-service/src/dsl/evaluator';
import { parseAll } from '../../../rule-engine-service/src/dsl/parser';

interface SignalWeight {
  name: string;
  weight: number;
}

const SIGNAL_WEIGHTS: SignalWeight[] = [
  { name: 'device',     weight: 0.35 },
  { name: 'velocity',   weight: 0.25 },
  { name: 'behavioral', weight: 0.20 },
  { name: 'network',    weight: 0.15 },
  { name: 'telco',      weight: 0.05 },
];

const BLOCK_THRESHOLD  = 70;
const REVIEW_THRESHOLD = 40;

// Circular buffer size for timing instrumentation
const TIMING_BUFFER_SIZE = 100;

// Path to default.rules — resolved at module init
const DEFAULT_RULES_PATH = path.join(
  __dirname,
  '..', '..', '..', 'rule-engine-service', 'src', 'rules', 'default.rules',
);

@Injectable()
export class DecisionOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(DecisionOrchestratorService.name);
  private readonly signalTimeoutMs: number;
  private readonly tracer = trace.getTracer('decision-orchestrator', '1.0.0');
  private readonly ruleEvaluator = new RuleEvaluator();
  private parsedRules: RuleNode[] = [];

  // Circular buffer for signal fetch timings
  private readonly fetchTimings: Array<{ signalName: string; ms: number }> = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly signalFetcher: SignalFetcher,
    @Optional() private readonly decisionGateway?: DecisionGateway,
    @Optional() private readonly decisionCache?: DecisionCacheService,
    @Optional() private readonly decisionStore?: DecisionStoreService,
    @Optional() private readonly watchlistService?: WatchlistService,
  ) {
    this.signalTimeoutMs =
      this.configService.get<number>('decision.signalTimeoutMs') ?? 150;
  }

  onModuleInit(): void {
    this.loadRules();
  }

  /**
   * Load DSL rules from default.rules file.
   * Falls back to empty ruleset if the file is not found.
   */
  loadRules(rulesText?: string): void {
    try {
      const source = rulesText ?? fs.readFileSync(DEFAULT_RULES_PATH, 'utf-8');
      this.parsedRules = parseAll(source);
      this.logger.log(`Loaded ${this.parsedRules.length} DSL rules`);
    } catch (err) {
      this.logger.warn(
        `Failed to load DSL rules: ${(err as Error).message}. Falling back to empty ruleset.`,
      );
      this.parsedRules = [];
    }
  }

  /** Expose parsed rules for testing */
  getParsedRules(): RuleNode[] {
    return this.parsedRules;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async decide(req: DecisionRequest): Promise<DecisionResult> {
    const startedAt = Date.now();

    // Check cache first
    if (this.decisionCache) {
      const cached = await this.decisionCache.get(req.merchantId, req.entityId);
      if (cached) {
        const cacheLatencyMs = Date.now() - startedAt;
        recordDecision(
          cached.action.toLowerCase() as 'allow' | 'block' | 'review',
          cacheLatencyMs,
          { merchant_id: req.merchantId, entity_type: (req as any).entityType ?? 'customer', source: 'cache' },
        );
        return { ...cached, cached: true, latencyMs: cacheLatencyMs };
      }
    }

    // Determine entity type for prior-decision memory (ADR-009)
    const entityType = (req as any).entityType ?? 'customer';

    // Watchlist check — denylist short-circuits to BLOCK (FD-2)
    if (this.watchlistService) {
      const watchlistResult = await this.watchlistService.checkWatchlist(
        req.merchantId, req.entityId, entityType,
      );

      if (watchlistResult.isDenylisted) {
        const latencyMs = Date.now() - startedAt;
        const denyResult: DecisionResult = {
          requestId: req.requestId,
          merchantId: req.merchantId,
          action: 'BLOCK',
          riskScore: 100,
          riskFactors: [{
            signal: 'watchlist.denylist',
            value: true,
            contribution: 100,
            description: watchlistResult.denylistReason || 'Entity is on denylist',
          }],
          appliedRules: ['watchlist.denylist'],
          latencyMs,
          cached: false,
          createdAt: new Date(),
        };

        // Persist + broadcast + cache
        if (this.decisionCache) await this.decisionCache.set(req.merchantId, req.entityId, denyResult);
        if (this.decisionStore) {
          await this.decisionStore.save({ ...denyResult, entityId: req.entityId, entityType, deviceId: req.deviceId } as any);
          this.decisionStore.updateEntityProfile(req.merchantId, entityType, req.entityId).catch(() => {});
        }
        if (this.decisionGateway) {
          this.decisionGateway.broadcastDecision({
            decisionId: req.requestId, merchantId: req.merchantId, entityId: req.entityId,
            action: 'BLOCK', riskScore: 100, timestamp: denyResult.createdAt.toISOString(),
            topRiskFactors: ['watchlist.denylist'],
          });
        }
        recordDecision('block', latencyMs, { merchant_id: req.merchantId, entity_type: entityType, reason: 'denylist' });
        return denyResult;
      }

      // Store watchlist info for score adjustment after scoring
      (req as any)._watchlistResult = watchlistResult;
    }

    // Fetch prior-decision memory in parallel with signal fetches (ADR-011)
    const priorMemoryPromise: Promise<PriorDecisionMemory> = this.decisionStore
      ? this.decisionStore.getPriorDecisionMemory(req.merchantId, req.entityId, entityType)
      : Promise.resolve({ previousBlockCount30d: 0, previousReviewCount7d: 0 });

    // Fetch all signals via fetchAllSignals() — 6 parallel fetches with circuit breakers
    // This replaces the previous 5-way Promise.allSettled + manual timeout wrapping.
    // fetchAllSignals() returns SignalBundle including stateful context (ADR-010).
    const fetchStart = Date.now();
    const bundle = await this.fetchWithSpan<SignalBundle>(
      'fetch.all-signals',
      { 'merchant.id': req.merchantId },
      this.signalFetcher.fetchAllSignals({
        deviceId: req.deviceId,
        entityId: req.entityId,
        merchantId: req.merchantId,
        sessionId: req.sessionId,
        ip: req.ip,
        msisdn: req.msisdn,
        billingCountry: req.billingCountry,
        customerId: (req as any).customerId,
        priorDecisionMemory: await priorMemoryPromise,
      }),
    );
    const fetchMs = Date.now() - fetchStart;
    this.recordFetchTiming('all-signals', fetchMs);

    // Extract signals from bundle
    const deviceSignal    = bundle.device;
    const velocitySignal  = bundle.velocity;
    const behavioralSignal = bundle.behavioral;
    const networkSignal   = bundle.network;
    const telcoSignal     = bundle.telco;

    // Await prior-decision memory (already resolved by now since we awaited it above)
    const priorMemory = await priorMemoryPromise;

    // Compute individual risk scores per signal
    const deviceScore    = deviceSignal    ? this.deviceRiskScore(deviceSignal)    : null;
    const velocityScore  = velocitySignal  ? this.velocityRiskScore(velocitySignal) : null;
    const behavioralScore = behavioralSignal ? this.behavioralRiskScore(behavioralSignal) : null;
    const networkScore   = networkSignal   ? this.networkRiskScore(networkSignal)   : null;
    const telcoScore     = telcoSignal     ? this.telcoRiskScore(telcoSignal)     : null;

    const scores: Array<{ name: string; score: number | null; weight: number }> = [
      { name: 'device',     score: deviceScore,     weight: 0.35 },
      { name: 'velocity',   score: velocityScore,   weight: 0.25 },
      { name: 'behavioral', score: behavioralScore, weight: 0.20 },
      { name: 'network',    score: networkScore,    weight: 0.15 },
      { name: 'telco',      score: telcoScore,      weight: 0.05 },
    ];

    // Compute weighted average — skip unavailable signals, renormalize weights
    let riskScore = this.computeWeightedScore(scores);

    // Prior-decision memory boost (ADR-011):
    // Previous BLOCKs in 30d increase risk; previous REVIEWs in 7d add minor boost
    if (priorMemory.previousBlockCount30d > 0) {
      const blockBoost = Math.min(15, priorMemory.previousBlockCount30d * 5);
      riskScore = Math.round(Math.min(100, riskScore + blockBoost));
    }
    if (priorMemory.previousReviewCount7d > 2) {
      const reviewBoost = Math.min(10, (priorMemory.previousReviewCount7d - 2) * 3);
      riskScore = Math.round(Math.min(100, riskScore + reviewBoost));
    }

    // Watchlist score adjustments (FD-2)
    const watchlistResult = (req as any)._watchlistResult;
    if (watchlistResult) {
      if (watchlistResult.isWatchlisted) {
        riskScore = Math.round(Math.min(100, riskScore + 20));
      } else if (watchlistResult.isAllowlisted) {
        riskScore = Math.round(Math.max(0, riskScore - 15));
      }
    }

    // Determine threshold-based action
    let action = this.computeAction(riskScore);

    // Extract risk factors
    const riskFactors = this.extractRiskFactors(
      deviceSignal,
      velocitySignal,
      behavioralSignal,
      networkSignal,
      telcoSignal,
      scores,
    );

    // Add prior-decision memory risk factor (ADR-011)
    if (priorMemory.previousBlockCount30d > 0) {
      riskFactors.push({
        signal: 'stateful.customer.previousBlockCount30d',
        value: priorMemory.previousBlockCount30d,
        contribution: Math.min(15, priorMemory.previousBlockCount30d * 5),
        description: `${priorMemory.previousBlockCount30d} previous BLOCK decision(s) in last 30 days`,
      });
    }
    if (priorMemory.previousReviewCount7d > 2) {
      riskFactors.push({
        signal: 'stateful.customer.previousReviewCount7d',
        value: priorMemory.previousReviewCount7d,
        contribution: Math.min(10, (priorMemory.previousReviewCount7d - 2) * 3),
        description: `${priorMemory.previousReviewCount7d} previous REVIEW decision(s) in last 7 days`,
      });
    }

    // Watchlist risk factors
    if (watchlistResult?.isWatchlisted) {
      riskFactors.push({
        signal: 'watchlist.watchlist',
        value: true,
        contribution: 20,
        description: watchlistResult.watchlistReason || 'Entity is on watchlist',
      });
    }
    if (watchlistResult?.isAllowlisted && !watchlistResult?.isWatchlisted) {
      riskFactors.push({
        signal: 'watchlist.allowlist',
        value: true,
        contribution: -15,
        description: 'Entity is on allowlist (score suppression)',
      });
    }

    // Graph intelligence risk factors (P1-1 Explainability)
    if (bundle.stateful?.graph) {
      const graph = bundle.stateful.graph;
      if (graph.fraudRingDetected) {
        riskFactors.push({
          signal: 'stateful.graph.fraudRingDetected',
          value: true,
          contribution: graph.fraudRingScore ?? 30,
          description: `Fraud ring detected (score: ${graph.fraudRingScore ?? 'N/A'})`,
        });
      }
      if (graph.sharedDeviceCount && graph.sharedDeviceCount > 1) {
        riskFactors.push({
          signal: 'stateful.graph.sharedDeviceCount',
          value: graph.sharedDeviceCount,
          contribution: Math.min(20, graph.sharedDeviceCount * 5),
          description: `${graph.sharedDeviceCount} entities share this device`,
        });
      }
    }

    // Sequence detection risk factors (P1-1 Explainability)
    if (bundle.stateful?.customer) {
      const seq = bundle.stateful.customer;
      if (seq.loginThenPayment15m) {
        riskFactors.push({
          signal: 'stateful.sequence.loginToPayment',
          value: true,
          contribution: 15,
          description: 'Login followed by payment within 15 minutes',
        });
      }
      if (seq.failedPaymentX3ThenSuccess10m) {
        riskFactors.push({
          signal: 'stateful.sequence.failedPaymentX3',
          value: true,
          contribution: 25,
          description: '3+ failed payments followed by success within 10 minutes',
        });
      }
      if (seq.deviceChangeThenPayment30m) {
        riskFactors.push({
          signal: 'stateful.sequence.deviceChangePayment',
          value: true,
          contribution: 20,
          description: 'Device change followed by payment within 30 minutes',
        });
      }
    }

    // --- DSL Rule Evaluation (Strategy A: override) ---
    // Compose SignalContext for the DSL evaluator from the SignalBundle
    const signalContext = this.composeSignalContext(bundle);
    let appliedRules: string[] = [];

    try {
      const ruleResults = this.ruleEvaluator.evaluateAll(this.parsedRules, signalContext);
      const matchedRules = ruleResults.filter(r => r.matched && !r.skipped);
      appliedRules = matchedRules.map(r => r.ruleId);

      // DSL override: BLOCK rules override everything, REVIEW upgrades ALLOW
      const hasBlockRule = matchedRules.some(r => r.action === 'BLOCK');
      const hasReviewRule = matchedRules.some(r => r.action === 'REVIEW');

      if (hasBlockRule) action = 'BLOCK';
      else if (hasReviewRule && action === 'ALLOW') action = 'REVIEW';
    } catch (err) {
      // DSL evaluation failure → fallback to threshold-based action (graceful degradation)
      this.logger.warn(`DSL rule evaluation failed: ${(err as Error).message}. Using threshold-based action.`);
      recordError('decision-service', 'dsl_evaluation_failure', { merchant_id: req.merchantId });
    }

    const latencyMs = Date.now() - startedAt;

    const result: DecisionResult = {
      requestId:    req.requestId,
      merchantId:   req.merchantId,
      action,
      riskScore,
      riskFactors,
      appliedRules,
      latencyMs,
      cached:       false,
      createdAt:    new Date(),
    };

    // Cache result before returning
    if (this.decisionCache) {
      await this.decisionCache.set(req.merchantId, req.entityId, result);
    }

    // Persist decision with entity info for typed prior-decision memory
    if (this.decisionStore) {
      await this.decisionStore.save({
        ...result,
        entityId: req.entityId,
        entityType,
        deviceId: req.deviceId,
      } as any);
      // Update entity profile (fire-and-forget, AR-7)
      this.decisionStore.updateEntityProfile(req.merchantId, entityType, req.entityId).catch(() => {});
      // Save feature snapshot for ML export (fire-and-forget, AR-6)
      this.decisionStore.saveFeatureSnapshot(
        req.requestId, req.merchantId, req.entityId, entityType,
        result.action, result.riskScore, bundle as any,
      ).catch(() => {});
    }

    // Broadcast to WebSocket clients
    if (this.decisionGateway) {
      const broadcastEvent: DecisionBroadcastEvent = {
        decisionId:      req.requestId,
        merchantId:      req.merchantId,
        entityId:        req.entityId,
        action,
        riskScore,
        timestamp:       result.createdAt.toISOString(),
        topRiskFactors:  riskFactors.slice(0, 3).map((f) => f.signal),
      };
      this.decisionGateway.broadcastDecision(broadcastEvent);
    }

    // Record decision telemetry (OTel counter + histogram)
    recordDecision(
      action.toLowerCase() as 'allow' | 'block' | 'review',
      latencyMs,
      { merchant_id: req.merchantId, entity_type: entityType },
    );

    return result;
  }

  // ---------------------------------------------------------------------------
  // Span wrapper for tracing
  // ---------------------------------------------------------------------------

  private async fetchWithSpan<T>(
    spanName: string,
    attributes: Record<string, string>,
    promise: Promise<T>,
  ): Promise<T> {
    const span = this.tracer.startSpan(spanName, { attributes });
    try {
      const result = await promise;
      span.setAttribute('signal.found', result !== null);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
      throw err;
    } finally {
      span.end();
    }
  }

  // Stores last 100 timings in memory circular buffer
  private recordFetchTiming(signalName: string, ms: number): void {
    if (this.fetchTimings.length >= TIMING_BUFFER_SIZE) {
      this.fetchTimings.shift();
    }
    this.fetchTimings.push({ signalName, ms });
  }

  // Expose timings for testing/monitoring
  getFetchTimings(): Array<{ signalName: string; ms: number }> {
    return [...this.fetchTimings];
  }

  // ---------------------------------------------------------------------------
  // Per-signal risk score derivation
  // ---------------------------------------------------------------------------

  /**
   * Device risk score: invert trust score; emulators get a heavy penalty.
   */
  private deviceRiskScore(sig: DeviceSignal): number {
    // trustScore 0-100 → riskScore 100-0
    let score = 100 - sig.trustScore;

    if (sig.isEmulator) {
      // Emulator detected — push score up aggressively
      score = Math.min(100, score + 30 + sig.emulatorConfidence * 30);
    }

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Velocity risk score: based on transaction count and burst detection.
   */
  private velocityRiskScore(sig: VelocitySignal): number {
    let score = 0;

    // High 1h transaction count
    if (sig.dimensions.txCount1h > 20)  score += 50;
    else if (sig.dimensions.txCount1h > 10) score += 30;
    else if (sig.dimensions.txCount1h > 5)  score += 10;

    // High 24h unique devices — account sharing or fraud
    if (sig.dimensions.uniqueDevices24h > 5)  score += 20;
    else if (sig.dimensions.uniqueDevices24h > 2) score += 10;

    // Burst detection
    if (sig.burstDetected) {
      const burstBonus = sig.burstRatio ? Math.min(30, sig.burstRatio * 10) : 20;
      score += burstBonus;
    }

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Behavioral risk score: use sessionRiskScore directly; bots get elevated.
   */
  private behavioralRiskScore(sig: BehavioralSignal): number {
    let score = sig.sessionRiskScore;

    if (sig.isBot) {
      score = Math.min(100, score + 40);
    } else if (sig.botProbability > 0.7) {
      score = Math.min(100, score + 20);
    }

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Network risk score: use riskScore directly + proxy/VPN/Tor bonuses.
   */
  private networkRiskScore(sig: NetworkSignal): number {
    let score = sig.riskScore ?? 0;

    if (sig.isTor)        score = Math.min(100, score + 40);
    if (sig.isProxy)      score = Math.min(100, score + 20);
    if (sig.isVpn)        score = Math.min(100, score + 15);
    if (sig.isDatacenter) score = Math.min(100, score + 10);

    // Geo mismatch compounds risk
    if (sig.geoMismatchScore > 70) score = Math.min(100, score + 15);

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Telco risk score: prepaid phones and recent port activity are riskier.
   */
  private telcoRiskScore(sig: TelcoSignal): number {
    let score = 0;

    score += sig.prepaidProbability * 40;

    if (sig.isPorted) {
      // Very recent port (<30 days) is higher risk
      if (sig.portDate) {
        const daysSincePort = Math.floor(
          (Date.now() - sig.portDate.getTime()) / 86_400_000,
        );
        score += daysSincePort < 7 ? 40 : daysSincePort < 30 ? 20 : 10;
      } else {
        score += 20;
      }
    }

    if (sig.lineType === 'prepaid') score += 15;

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  // ---------------------------------------------------------------------------
  // Score aggregation
  // ---------------------------------------------------------------------------

  computeWeightedScore(
    scores: Array<{ name: string; score: number | null; weight: number }>,
  ): number {
    const available = scores.filter((s) => s.score !== null && !isNaN(s.score as number));

    if (available.length === 0) {
      // All signals failed — return a neutral-high score that triggers REVIEW
      return 50;
    }

    const totalWeight = available.reduce((sum, s) => sum + s.weight, 0);
    const weightedSum = available.reduce(
      (sum, s) => sum + (s.score as number) * (s.weight / totalWeight),
      0,
    );

    return Math.round(Math.max(0, Math.min(100, weightedSum)));
  }

  computeAction(riskScore: number): DecisionAction {
    if (riskScore >= BLOCK_THRESHOLD)  return 'BLOCK';
    if (riskScore >= REVIEW_THRESHOLD) return 'REVIEW';
    return 'ALLOW';
  }

  /**
   * Compute a weighted risk score from a SignalBundle.
   *
   * Task weights (Sprint 14):
   *   device:    25%
   *   behavioral: 20%
   *   velocity:  20%
   *   network:   20%
   *   telco:     15%
   *
   * Each signal must expose a `riskScore` property (0-100).  If a signal is
   * null its weight is redistributed proportionally among the available ones.
   * When no signals are present a neutral REVIEW score of 50 is returned.
   */
  computeWeightedScoreFromBundle(bundle: SignalBundle): number {
    // Derive per-signal riskScore values
    const deviceScore     = bundle.device
      ? this.deviceRiskScore(bundle.device)
      : null;
    const behavioralScore = bundle.behavioral
      ? this.behavioralRiskScore(bundle.behavioral)
      : null;
    const velocityScore   = bundle.velocity
      ? this.velocityRiskScore(bundle.velocity)
      : null;
    const networkScore    = bundle.network
      ? this.networkRiskScore(bundle.network)
      : null;
    const telcoScore      = bundle.telco
      ? this.telcoRiskScore(bundle.telco)
      : null;

    const scores: Array<{ name: string; score: number | null; weight: number }> = [
      { name: 'device',     score: deviceScore,     weight: 0.25 },
      { name: 'behavioral', score: behavioralScore, weight: 0.20 },
      { name: 'velocity',   score: velocityScore,   weight: 0.20 },
      { name: 'network',    score: networkScore,    weight: 0.20 },
      { name: 'telco',      score: telcoScore,      weight: 0.15 },
    ];

    return this.computeWeightedScore(scores);
  }

  // ---------------------------------------------------------------------------
  // Risk factor extraction
  // ---------------------------------------------------------------------------

  private extractRiskFactors(
    device: DeviceSignal | null,
    velocity: VelocitySignal | null,
    behavioral: BehavioralSignal | null,
    network: NetworkSignal | null,
    telco: TelcoSignal | null,
    scores: Array<{ name: string; score: number | null; weight: number }>,
  ): RiskFactor[] {
    const factors: RiskFactor[] = [];

    if (device) {
      const s = scores.find((x) => x.name === 'device');
      factors.push({
        signal: 'device.trustScore',
        value: device.trustScore,
        contribution: s?.score ?? 0,
        description: device.isEmulator
          ? `Device identified as emulator (confidence ${(device.emulatorConfidence * 100).toFixed(0)}%)`
          : `Device trust score: ${device.trustScore}/100`,
      });
      if (device.isEmulator) {
        factors.push({
          signal: 'device.isEmulator',
          value: true,
          contribution: Math.min(100, (s?.score ?? 0) + 20),
          description: 'Emulator device detected',
        });
      }
    }

    if (velocity) {
      const s = scores.find((x) => x.name === 'velocity');
      factors.push({
        signal: 'velocity.txCount1h',
        value: velocity.dimensions.txCount1h,
        contribution: s?.score ?? 0,
        description: `${velocity.dimensions.txCount1h} transactions in the last hour`,
      });
      if (velocity.burstDetected) {
        factors.push({
          signal: 'velocity.burstDetected',
          value: true,
          contribution: Math.min(100, (s?.score ?? 0) + 15),
          description: `Transaction burst detected on ${velocity.burstDimension ?? 'unknown dimension'}`,
        });
      }
    }

    if (behavioral) {
      const s = scores.find((x) => x.name === 'behavioral');
      factors.push({
        signal: 'behavioral.sessionRiskScore',
        value: behavioral.sessionRiskScore,
        contribution: s?.score ?? 0,
        description: behavioral.isBot
          ? 'Bot behavior detected in session'
          : `Behavioral risk score: ${behavioral.sessionRiskScore}/100`,
      });
    }

    if (network) {
      const s = scores.find((x) => x.name === 'network');
      factors.push({
        signal: 'network.riskScore',
        value: network.riskScore,
        contribution: s?.score ?? 0,
        description: [
          network.isTor   ? 'Tor exit node'   : null,
          network.isProxy ? 'Proxy detected'  : null,
          network.isVpn   ? 'VPN detected'    : null,
          network.riskScore > 0 ? `Network risk score: ${network.riskScore}/100` : null,
        ]
          .filter(Boolean)
          .join(', ') || `Network risk score: ${network.riskScore}/100`,
      });
    }

    if (telco) {
      const s = scores.find((x) => x.name === 'telco');
      factors.push({
        signal: 'telco.prepaidProbability',
        value: telco.prepaidProbability,
        contribution: s?.score ?? 0,
        description: telco.isPorted
          ? 'Phone number recently ported'
          : `Prepaid probability: ${(telco.prepaidProbability * 100).toFixed(0)}%`,
      });
    }

    // Sort by contribution descending — highest contributors first
    return factors.sort((a, b) => b.contribution - a.contribution);
  }

  // ---------------------------------------------------------------------------
  // SignalBundle → DSL SignalContext mapping
  // ---------------------------------------------------------------------------

  /**
   * Compose a SignalContext suitable for the DSL RuleEvaluator from a SignalBundle.
   * Flattens velocity dimensions to top-level fields for DSL field resolution.
   */
  composeSignalContext(bundle: SignalBundle): SignalContext {
    return {
      device: bundle.device ? {
        deviceId: bundle.device.deviceId,
        trustScore: bundle.device.trustScore,
        isEmulator: bundle.device.isEmulator,
        emulatorConfidence: bundle.device.emulatorConfidence,
        platform: bundle.device.platform,
      } : undefined,
      velocity: bundle.velocity ? {
        entityId: bundle.velocity.entityId,
        // Flatten dimensions to top-level for DSL resolution (velocity.txCount1h)
        txCount1h: bundle.velocity.dimensions.txCount1h,
        txCount10m: bundle.velocity.dimensions.txCount10m,
        txCount24h: bundle.velocity.dimensions.txCount24h,
        amountSum1h: bundle.velocity.dimensions.amountSum1h,
        amountSum24h: bundle.velocity.dimensions.amountSum24h,
        uniqueDevices24h: bundle.velocity.dimensions.uniqueDevices24h,
        uniqueIps24h: bundle.velocity.dimensions.uniqueIps24h,
        uniqueSessions1h: bundle.velocity.dimensions.uniqueSessions1h,
        burstDetected: bundle.velocity.burstDetected,
        burstRatio: bundle.velocity.burstRatio,
        dimensions: bundle.velocity.dimensions,
      } as any : undefined,
      behavioral: bundle.behavioral ? {
        sessionId: bundle.behavioral.sessionId,
        sessionRiskScore: bundle.behavioral.sessionRiskScore,
        isBot: bundle.behavioral.isBot,
        botProbability: bundle.behavioral.botProbability,
      } : undefined,
      network: bundle.network ? {
        ip: bundle.network.ip,
        isTor: bundle.network.isTor,
        isProxy: bundle.network.isProxy,
        isVpn: bundle.network.isVpn,
        isDatacenter: bundle.network.isDatacenter,
        geoMismatchScore: bundle.network.geoMismatchScore,
        riskScore: bundle.network.riskScore,
      } : undefined,
      telco: bundle.telco ? {
        msisdn: bundle.telco.msisdn,
        prepaidProbability: bundle.telco.prepaidProbability,
        isPorted: bundle.telco.isPorted,
        lineType: bundle.telco.lineType,
      } : undefined,
      stateful: bundle.stateful ?? undefined,
    };
  }
}
