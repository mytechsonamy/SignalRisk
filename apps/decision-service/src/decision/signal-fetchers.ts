/**
 * SignalRisk Decision Service — Real HTTP Signal Fetchers
 *
 * Sprint 5: Real HTTP clients using native fetch (Node 18+) with
 * AbortController-based 150ms hard timeouts per downstream service.
 *
 * Graceful degradation: any network error, timeout, or non-2xx response
 * returns null — the orchestrator continues with remaining signals.
 *
 * Sprint 14: Added SSRF guard, SignalBundle parallel aggregation, and
 * per-signal circuit breaker (3 consecutive failures → OPEN for 30s).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ---------------------------------------------------------------------------
// Signal types — mirrored from @signalrisk/signal-contracts
// ---------------------------------------------------------------------------

export interface DeviceSignal {
  deviceId: string;
  merchantId: string;
  fingerprint: string;
  trustScore: number;        // 0-100
  isEmulator: boolean;
  emulatorConfidence: number; // 0-1
  platform: 'web' | 'android' | 'ios';
  firstSeenAt: Date;
  lastSeenAt: Date;
  daysSinceFirstSeen: number;
}

export interface VelocitySignal {
  entityId: string;
  merchantId: string;
  entityType?: 'customer' | 'device' | 'ip';
  dimensions: {
    txCount10m: number;
    txCount1h: number;
    txCount24h: number;
    amountSum1h: number;
    amountSum24h: number;
    uniqueDevices24h: number;
    uniqueIps24h: number;
    uniqueSessions1h: number;
  };
  burstDetected: boolean;
  burstDimension?: string;
  burstRatio?: number;
}

export interface BehavioralSignal {
  sessionId: string;
  merchantId: string;
  sessionRiskScore: number;   // 0-100
  botProbability: number;     // 0-1
  isBot: boolean;
  indicators: string[];
  timingCv?: number;
  navigationEntropy?: number;
}

export interface NetworkSignal {
  ip: string;
  merchantId: string;
  country?: string;
  city?: string;
  asn?: string;
  isProxy: boolean;
  isVpn: boolean;
  isTor: boolean;
  isDatacenter: boolean;
  geoMismatchScore: number;   // 0-100
  riskScore: number;          // 0-100
}

export interface TelcoSignal {
  msisdn: string;
  merchantId: string;
  operator?: string;
  lineType?: 'prepaid' | 'postpaid' | 'unknown';
  isPorted: boolean;
  portDate?: Date;
  prepaidProbability: number; // 0-1
  countryCode?: string;
}

// ---------------------------------------------------------------------------
// SignalBundle — aggregated result of all parallel signal fetches
// ---------------------------------------------------------------------------

export interface SignalBundle {
  device:     DeviceSignal | null;
  behavioral: BehavioralSignal | null;
  network:    NetworkSignal | null;
  telco:      TelcoSignal | null;
  velocity:   VelocitySignal | null;
  /** Stateful context composed from multi-entity velocity fetches (ADR-010). */
  stateful:   StatefulContext | null;
}

// ---------------------------------------------------------------------------
// Stateful context — multi-entity-type velocity signals (ADR-009, ADR-010)
// ---------------------------------------------------------------------------

/** Velocity dimensions available per entity type */
interface StatefulVelocityDims {
  txCount10m?: number;
  txCount1h?: number;
  txCount24h?: number;
  amountSum1h?: number;
  amountSum24h?: number;
  uniqueDevices24h?: number;
  uniqueIps24h?: number;
  uniqueSessions1h?: number;
  burstDetected?: boolean;
}

/** Sequence detection results (Sprint 7) */
interface SequenceFlags {
  loginThenPayment15m?: boolean;
  failedPaymentX3ThenSuccess10m?: boolean;
  deviceChangeThenPayment30m?: boolean;
}

/** Graph intelligence features (Sprint 8) */
interface GraphFeatures {
  sharedDeviceCount?: number;
  sharedIpCount?: number;
  fraudRingDetected?: boolean;
  fraudRingScore?: number;
}

/** Stateful feature context for rule evaluation. Namespace: stateful.{entityType}.{feature} */
export interface StatefulContext {
  customer?: StatefulVelocityDims & SequenceFlags & {
    /** BLOCK count in last 30 days (ADR-011) */
    previousBlockCount30d?: number;
    /** REVIEW count in last 7 days (ADR-011) */
    previousReviewCount7d?: number;
  };
  device?: StatefulVelocityDims;
  ip?: StatefulVelocityDims;
  /** Graph intelligence features (Sprint 8) */
  graph?: GraphFeatures;
}

/** Prior-decision memory result */
export interface PriorDecisionMemory {
  previousBlockCount30d: number;
  previousReviewCount7d: number;
}

// ---------------------------------------------------------------------------
// SSRF guard — rejects any URL whose hostname is not a known internal host
// ---------------------------------------------------------------------------

/**
 * Throws if the URL resolves to an external host.
 * Allowed: localhost, 127.0.0.1, or any *.svc.cluster.local hostname.
 */
export function assertInternalHost(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`SSRF: invalid URL '${url}'`);
  }

  const { hostname } = parsed;

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.svc.cluster.local')
  ) {
    return;
  }

  throw new Error('SSRF: external host rejected');
}

// ---------------------------------------------------------------------------
// Circuit breaker state per signal key
// ---------------------------------------------------------------------------

interface CircuitBreakerState {
  consecutiveFailures: number;
  openUntil: number | null; // epoch ms; null = CLOSED
}

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_DURATION_MS  = 30_000; // 30 seconds

// ---------------------------------------------------------------------------
// Internal helper: fetch with AbortController timeout
// ---------------------------------------------------------------------------

/**
 * Execute a fetch request with an AbortController timeout.
 * Returns null on timeout, network error, or non-2xx HTTP status.
 */
async function fetchWithTimeout<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = parseInt(process.env.SIGNAL_TIMEOUT_MS || '150', 10),
): Promise<T | null> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    // AbortError (timeout) or network error — return null for graceful degradation
    return null;
  } finally {
    clearTimeout(timerId);
  }
}

// ---------------------------------------------------------------------------
// SignalFetcher — injectable service for real HTTP signal retrieval
// ---------------------------------------------------------------------------

@Injectable()
export class SignalFetcher {
  private readonly logger = new Logger(SignalFetcher.name);

  /** Per-signal circuit breaker state keyed by signal name. */
  private readonly circuits = new Map<string, CircuitBreakerState>([
    ['device',     { consecutiveFailures: 0, openUntil: null }],
    ['velocity',   { consecutiveFailures: 0, openUntil: null }],
    ['behavioral', { consecutiveFailures: 0, openUntil: null }],
    ['network',    { consecutiveFailures: 0, openUntil: null }],
    ['telco',      { consecutiveFailures: 0, openUntil: null }],
  ]);

  constructor(private readonly config: ConfigService) {}

  // -------------------------------------------------------------------------
  // Circuit breaker helpers
  // -------------------------------------------------------------------------

  /** Returns true if the circuit is OPEN and the signal should be skipped. */
  isCircuitOpen(key: string): boolean {
    const state = this.circuits.get(key);
    if (!state) return false;
    if (state.openUntil !== null) {
      if (Date.now() < state.openUntil) {
        return true; // still open
      }
      // Half-open: reset and try again
      state.openUntil = null;
      state.consecutiveFailures = 0;
    }
    return false;
  }

  /** Record a successful call — resets the circuit. */
  recordSuccess(key: string): void {
    const state = this.circuits.get(key);
    if (!state) return;
    state.consecutiveFailures = 0;
    state.openUntil = null;
  }

  /** Record a failed call — opens circuit after threshold. */
  recordFailure(key: string): void {
    const state = this.circuits.get(key);
    if (!state) return;
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
      state.openUntil = Date.now() + CIRCUIT_OPEN_DURATION_MS;
      this.logger.warn(
        `Circuit breaker OPEN for signal '${key}' after ${state.consecutiveFailures} consecutive failures. ` +
        `Will retry after ${CIRCUIT_OPEN_DURATION_MS / 1000}s.`,
      );
    }
  }

  /**
   * Wraps an async signal fetch with circuit breaker accounting.
   * Returns null immediately if the circuit is open.
   */
  private async withCircuitBreaker<T>(
    key: string,
    fn: () => Promise<T | null>,
  ): Promise<T | null> {
    if (this.isCircuitOpen(key)) {
      this.logger.warn(`Circuit breaker open — skipping signal '${key}'`);
      return null;
    }
    try {
      const result = await fn();
      if (result !== null) {
        this.recordSuccess(key);
      } else {
        this.recordFailure(key);
      }
      return result;
    } catch (err) {
      this.recordFailure(key);
      this.logger.warn(`Signal '${key}' threw unexpectedly: ${(err as Error)?.message}`);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // fetchAllSignals — parallel aggregation of all 5 intel services
  // -------------------------------------------------------------------------

  /**
   * Fetches all 5 intelligence signals in parallel via Promise.allSettled.
   * Each signal is wrapped with its circuit breaker — a null is returned for
   * any signal that fails, times out, or has its circuit open.
   *
   * Weights used downstream:
   *   device: 25%, behavioral: 20%, velocity: 20%, network: 20%, telco: 15%
   */
  async fetchAllSignals(params: {
    deviceId?:      string;
    entityId:       string;
    merchantId:     string;
    sessionId?:     string;
    ip?:            string;
    msisdn?:        string;
    billingCountry?: string;
    customerId?:    string;
    priorDecisionMemory?: PriorDecisionMemory | null;
  }): Promise<SignalBundle> {
    const { deviceId, entityId, merchantId, sessionId, ip, msisdn, billingCountry, customerId, priorDecisionMemory } = params;

    const [deviceResult, behavioralResult, networkResult, telcoResult, velocityResult, statefulResult] =
      await Promise.allSettled([
        this.withCircuitBreaker('device', () =>
          deviceId
            ? this.fetchDeviceSignal(deviceId, merchantId)
            : Promise.resolve(null),
        ),
        this.withCircuitBreaker('behavioral', () =>
          sessionId
            ? this.fetchBehavioralSignal(sessionId, merchantId)
            : Promise.resolve(null),
        ),
        this.withCircuitBreaker('network', () =>
          ip
            ? this.fetchNetworkSignal(ip, merchantId, undefined, billingCountry)
            : Promise.resolve(null),
        ),
        this.withCircuitBreaker('telco', () =>
          msisdn
            ? this.fetchTelcoSignal(msisdn, merchantId)
            : Promise.resolve(null),
        ),
        this.withCircuitBreaker('velocity', () =>
          this.fetchVelocitySignal(customerId || entityId, merchantId),
        ),
        // Fetch stateful context: multi-entity velocity (ADR-009) + prior-decision (ADR-011)
        this.fetchStatefulContext({
          customerId: customerId || entityId,
          deviceId,
          ip,
          merchantId,
          priorDecisionMemory: priorDecisionMemory ?? undefined,
        }),
      ]);

    const extractOrNull = <T>(result: PromiseSettledResult<T | null>): T | null => {
      if (result.status === 'fulfilled') return result.value;
      this.logger.warn(`Signal fetch rejected: ${(result.reason as Error)?.message}`);
      return null;
    };

    return {
      device:     extractOrNull(deviceResult),
      behavioral: extractOrNull(behavioralResult),
      network:    extractOrNull(networkResult),
      telco:      extractOrNull(telcoResult),
      velocity:   extractOrNull(velocityResult),
      stateful:   statefulResult.status === 'fulfilled' ? statefulResult.value : null,
    };
  }

  // -------------------------------------------------------------------------
  // Device signal — GET /v1/fingerprint/devices/{deviceId}?merchantId={merchantId}
  // -------------------------------------------------------------------------

  async fetchDeviceSignal(
    deviceId: string,
    merchantId: string,
  ): Promise<DeviceSignal | null> {
    const baseUrl =
      this.config.get<string>('services.deviceIntelUrl') ?? 'http://localhost:3003';
    const url = `${baseUrl}/v1/fingerprint/devices/${encodeURIComponent(deviceId)}?merchantId=${encodeURIComponent(merchantId)}`;
    return fetchWithTimeout<DeviceSignal>(url);
  }

  // -------------------------------------------------------------------------
  // Velocity signal — GET /v1/velocity/{entityId} with X-Merchant-ID header
  // -------------------------------------------------------------------------

  async fetchVelocitySignal(
    entityId: string,
    merchantId: string,
    entityType?: 'customer' | 'device' | 'ip',
  ): Promise<VelocitySignal | null> {
    const baseUrl =
      this.config.get<string>('services.velocityUrl') ?? 'http://localhost:3004';
    const typeParam = entityType ? `?entityType=${entityType}` : '';
    const url = `${baseUrl}/v1/velocity/${encodeURIComponent(entityId)}${typeParam}`;
    const raw = await fetchWithTimeout<Record<string, unknown>>(url, {
      headers: { 'X-Merchant-ID': merchantId },
    });
    if (!raw) return null;

    // Velocity-service returns { signals: { tx_count_1h, ... }, burst_detected }
    // Map to VelocitySignal { dimensions: { txCount1h, ... }, burstDetected }
    const signals = (raw as any).signals ?? (raw as any).dimensions ?? {};
    return {
      entityId: (raw as any).entityId ?? entityId,
      merchantId: (raw as any).merchantId ?? merchantId,
      entityType: (raw as any).entityType ?? entityType,
      dimensions: {
        txCount10m:       signals.txCount10m       ?? signals.tx_count_10m       ?? 0,
        txCount1h:        signals.txCount1h        ?? signals.tx_count_1h        ?? 0,
        txCount24h:       signals.txCount24h       ?? signals.tx_count_24h       ?? 0,
        amountSum1h:      signals.amountSum1h      ?? signals.amount_sum_1h      ?? 0,
        amountSum24h:     signals.amountSum24h     ?? signals.amount_sum_24h     ?? 0,
        uniqueDevices24h: signals.uniqueDevices24h ?? signals.unique_devices_24h ?? 0,
        uniqueIps24h:     signals.uniqueIps24h     ?? signals.unique_ips_24h     ?? 0,
        uniqueSessions1h: signals.uniqueSessions1h ?? signals.unique_sessions_1h ?? 0,
      },
      burstDetected: (raw as any).burstDetected ?? (raw as any).burst_detected ?? false,
      burstRatio:    (raw as any).burstRatio    ?? (raw as any).burst_ratio,
    };
  }

  // -------------------------------------------------------------------------
  // Stateful context — multi-entity velocity fetch (ADR-009, ADR-010)
  // -------------------------------------------------------------------------

  /**
   * Fetches velocity signals for all 3 entity types in parallel,
   * plus prior-decision memory (ADR-011).
   * Composes a StatefulContext for rule evaluation.
   */
  async fetchStatefulContext(params: {
    customerId: string;
    deviceId?: string;
    ip?: string;
    merchantId: string;
    priorDecisionMemory?: PriorDecisionMemory | null;
  }): Promise<StatefulContext> {
    const { customerId, deviceId, ip, merchantId, priorDecisionMemory } = params;

    const [customerResult, deviceResult, ipResult, graphResult] = await Promise.allSettled([
      this.withCircuitBreaker('velocity', () =>
        this.fetchVelocitySignal(customerId, merchantId, 'customer'),
      ),
      deviceId
        ? this.withCircuitBreaker('velocity', () =>
            this.fetchVelocitySignal(deviceId, merchantId, 'device'),
          )
        : Promise.resolve(null),
      ip
        ? this.withCircuitBreaker('velocity', () =>
            this.fetchVelocitySignal(ip.toLowerCase().trim(), merchantId, 'ip'),
          )
        : Promise.resolve(null),
      // Graph intelligence (Sprint 8) — fetch if deviceId is available
      deviceId
        ? this.fetchGraphContext(deviceId, merchantId)
        : Promise.resolve(null),
    ]);

    const extractDims = (result: PromiseSettledResult<VelocitySignal | null>): StatefulVelocityDims | undefined => {
      if (result.status !== 'fulfilled' || !result.value) return undefined;
      const d = result.value.dimensions;
      return {
        txCount10m: d.txCount10m,
        txCount1h: d.txCount1h,
        txCount24h: d.txCount24h,
        amountSum1h: d.amountSum1h,
        amountSum24h: d.amountSum24h,
        uniqueDevices24h: d.uniqueDevices24h,
        uniqueIps24h: d.uniqueIps24h,
        uniqueSessions1h: d.uniqueSessions1h,
        burstDetected: result.value.burstDetected,
      };
    };

    const customerDims = extractDims(customerResult);

    // Merge prior-decision memory into customer context (ADR-011)
    const customer = customerDims
      ? {
          ...customerDims,
          ...(priorDecisionMemory
            ? {
                previousBlockCount30d: priorDecisionMemory.previousBlockCount30d,
                previousReviewCount7d: priorDecisionMemory.previousReviewCount7d,
              }
            : {}),
        }
      : priorDecisionMemory
        ? {
            previousBlockCount30d: priorDecisionMemory.previousBlockCount30d,
            previousReviewCount7d: priorDecisionMemory.previousReviewCount7d,
          }
        : undefined;

    // Extract graph features (Sprint 8)
    const graph = graphResult.status === 'fulfilled' && graphResult.value
      ? graphResult.value
      : undefined;

    return {
      customer,
      device: extractDims(deviceResult),
      ip: extractDims(ipResult),
      graph,
    };
  }

  // -------------------------------------------------------------------------
  // Graph intelligence — POST /graph-intel/analyze (Sprint 8)
  // -------------------------------------------------------------------------

  async fetchGraphContext(
    deviceId: string,
    merchantId: string,
  ): Promise<GraphFeatures | null> {
    const baseUrl =
      this.config.get<string>('services.graphIntelUrl') ?? 'http://localhost:3009';
    const url = `${baseUrl}/graph-intel/analyze`;
    const raw = await fetchWithTimeout<Record<string, unknown>>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, merchantId }),
    });
    if (!raw) return null;

    return {
      sharedDeviceCount: (raw.sharedDeviceCount as number) ?? 0,
      sharedIpCount: (raw.sharedIpCount as number) ?? 0,
      fraudRingDetected: (raw.fraudRingDetected as boolean) ?? false,
      fraudRingScore: (raw.riskScore as number) ?? 0,
    };
  }

  // -------------------------------------------------------------------------
  // Behavioral signal — POST /v1/behavioral/analyze  { sessionId, merchantId }
  // -------------------------------------------------------------------------

  async fetchBehavioralSignal(
    sessionId: string,
    merchantId: string,
  ): Promise<BehavioralSignal | null> {
    const baseUrl =
      this.config.get<string>('services.behavioralUrl') ?? 'http://localhost:3005';
    const url = `${baseUrl}/v1/behavioral/analyze`;
    return fetchWithTimeout<BehavioralSignal>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, merchantId }),
    });
  }

  // -------------------------------------------------------------------------
  // Network signal — POST /v1/network/analyze  { ip, merchantId, msisdnCountry, billingCountry }
  // -------------------------------------------------------------------------

  async fetchNetworkSignal(
    ip: string,
    merchantId: string,
    msisdnCountry?: string,
    billingCountry?: string,
  ): Promise<NetworkSignal | null> {
    const baseUrl =
      this.config.get<string>('services.networkIntelUrl') ?? 'http://localhost:3006';
    const url = `${baseUrl}/v1/network/analyze`;
    return fetchWithTimeout<NetworkSignal>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, merchantId, msisdnCountry, billingCountry }),
    });
  }

  // -------------------------------------------------------------------------
  // Telco signal — POST /v1/telco/analyze  { msisdn, merchantId }
  // -------------------------------------------------------------------------

  async fetchTelcoSignal(
    msisdn: string,
    merchantId: string,
  ): Promise<TelcoSignal | null> {
    const baseUrl =
      this.config.get<string>('services.telcoIntelUrl') ?? 'http://localhost:3007';
    const url = `${baseUrl}/v1/telco/analyze`;
    return fetchWithTimeout<TelcoSignal>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msisdn, merchantId }),
    });
  }
}
