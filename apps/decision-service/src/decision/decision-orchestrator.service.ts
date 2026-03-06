/**
 * SignalRisk Decision Service — Decision Orchestrator
 *
 * Orchestrates all intelligence signals in parallel (with per-signal timeout),
 * aggregates weighted risk scores, and produces a final ALLOW/REVIEW/BLOCK decision.
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
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace, SpanStatusCode } from '@opentelemetry/api';
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
} from './signal-fetchers';
import { DecisionGateway, DecisionBroadcastEvent } from './decision.gateway';
import { DecisionCacheService } from './decision-cache.service';

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

@Injectable()
export class DecisionOrchestratorService {
  private readonly logger = new Logger(DecisionOrchestratorService.name);
  private readonly signalTimeoutMs: number;
  private readonly tracer = trace.getTracer('decision-orchestrator', '1.0.0');

  // Circular buffer for signal fetch timings
  private readonly fetchTimings: Array<{ signalName: string; ms: number }> = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly signalFetcher: SignalFetcher,
    @Optional() private readonly decisionGateway?: DecisionGateway,
    @Optional() private readonly decisionCache?: DecisionCacheService,
  ) {
    this.signalTimeoutMs =
      this.configService.get<number>('decision.signalTimeoutMs') ?? 150;
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
        return { ...cached, cached: true, latencyMs: Date.now() - startedAt };
      }
    }

    // Fetch all signals in parallel with per-signal timeout, each wrapped in a span
    const [device, velocity, behavioral, network, telco] = await Promise.allSettled([
      this.withTimeout(
        this.fetchWithSpanTimed(
          'fetch.device-signal',
          { 'signal.type': 'device', 'merchant.id': req.merchantId },
          req.deviceId
            ? this.signalFetcher.fetchDeviceSignal(req.deviceId, req.merchantId)
            : Promise.resolve(null),
          'device',
        ),
        this.signalTimeoutMs,
        'device',
      ),
      this.withTimeout(
        this.fetchWithSpanTimed(
          'fetch.velocity-signal',
          { 'signal.type': 'velocity', 'merchant.id': req.merchantId },
          this.signalFetcher.fetchVelocitySignal(req.entityId, req.merchantId),
          'velocity',
        ),
        this.signalTimeoutMs,
        'velocity',
      ),
      this.withTimeout(
        this.fetchWithSpanTimed(
          'fetch.behavioral-signal',
          { 'signal.type': 'behavioral', 'merchant.id': req.merchantId },
          req.sessionId
            ? this.signalFetcher.fetchBehavioralSignal(req.sessionId, req.merchantId)
            : Promise.resolve(null),
          'behavioral',
        ),
        this.signalTimeoutMs,
        'behavioral',
      ),
      this.withTimeout(
        this.fetchWithSpanTimed(
          'fetch.network-signal',
          { 'signal.type': 'network', 'merchant.id': req.merchantId },
          req.ip
            ? this.signalFetcher.fetchNetworkSignal(req.ip, req.merchantId, undefined, req.billingCountry)
            : Promise.resolve(null),
          'network',
        ),
        this.signalTimeoutMs,
        'network',
      ),
      this.withTimeout(
        this.fetchWithSpanTimed(
          'fetch.telco-signal',
          { 'signal.type': 'telco', 'merchant.id': req.merchantId },
          req.msisdn
            ? this.signalFetcher.fetchTelcoSignal(req.msisdn, req.merchantId)
            : Promise.resolve(null),
          'telco',
        ),
        this.signalTimeoutMs,
        'telco',
      ),
    ]);

    // Extract values from settled results — null on timeout/rejection
    const deviceSignal    = this.extractSignal<DeviceSignal | null>(device,    'device');
    const velocitySignal  = this.extractSignal<VelocitySignal | null>(velocity,  'velocity');
    const behavioralSignal = this.extractSignal<BehavioralSignal | null>(behavioral, 'behavioral');
    const networkSignal   = this.extractSignal<NetworkSignal | null>(network,   'network');
    const telcoSignal     = this.extractSignal<TelcoSignal | null>(telco,     'telco');

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
    const riskScore = this.computeWeightedScore(scores);

    // Determine action
    const action = this.computeAction(riskScore);

    // Extract risk factors
    const riskFactors = this.extractRiskFactors(
      deviceSignal,
      velocitySignal,
      behavioralSignal,
      networkSignal,
      telcoSignal,
      scores,
    );

    // Determine which rules matched
    const appliedRules = this.matchRules(riskScore, riskFactors);

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

    return result;
  }

  // ---------------------------------------------------------------------------
  // Per-signal span wrapper
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

  // fetchWithSpan + timing instrumentation
  private async fetchWithSpanTimed<T>(
    spanName: string,
    attributes: Record<string, string>,
    promise: Promise<T>,
    signalName: string,
  ): Promise<T> {
    const fetchStart = Date.now();
    const span = this.tracer.startSpan(spanName, { attributes });
    try {
      const result = await promise;
      span.setAttribute('signal.found', result !== null);
      span.setStatus({ code: SpanStatusCode.OK });
      const fetchMs = Date.now() - fetchStart;
      this.recordFetchTiming(signalName, fetchMs);
      if (fetchMs > 100) {
        this.logger.warn(`Signal fetch slow: ${signalName} took ${fetchMs}ms`);
      }
      return result;
    } catch (err) {
      const fetchMs = Date.now() - fetchStart;
      this.recordFetchTiming(signalName, fetchMs);
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
  // Signal timeout wrapper
  // ---------------------------------------------------------------------------

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => {
        this.logger.warn(`Signal fetch timed out: ${label} (${ms}ms)`);
        resolve(null);
      }, ms),
    );
    return Promise.race([promise, timeout]) as Promise<T | null>;
  }

  private extractSignal<T>(settled: PromiseSettledResult<T | null>, label: string): T | null {
    if (settled.status === 'fulfilled') {
      return settled.value;
    }
    this.logger.warn(`Signal fetch rejected: ${label} — ${(settled.reason as Error)?.message}`);
    return null;
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
    let score = sig.riskScore;

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
    const available = scores.filter((s) => s.score !== null);

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
  // Rule matching
  // ---------------------------------------------------------------------------

  private matchRules(riskScore: number, factors: RiskFactor[]): string[] {
    const rules: string[] = [];

    if (riskScore >= BLOCK_THRESHOLD)  rules.push('rule:auto-block-high-risk');
    if (riskScore >= REVIEW_THRESHOLD) rules.push('rule:review-elevated-risk');

    const hasEmulator  = factors.some((f) => f.signal === 'device.isEmulator'   && f.value === true);
    const hasBurst     = factors.some((f) => f.signal === 'velocity.burstDetected' && f.value === true);
    const hasTor       = factors.some((f) => f.signal === 'network.riskScore'   && f.description.includes('Tor'));
    const hasBot       = factors.some((f) => f.signal === 'behavioral.sessionRiskScore' && f.description.includes('Bot'));

    if (hasEmulator) rules.push('rule:emulator-detected');
    if (hasBurst)    rules.push('rule:velocity-burst');
    if (hasTor)      rules.push('rule:tor-exit-node');
    if (hasBot)      rules.push('rule:bot-behavioral-pattern');

    return rules;
  }
}
