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
  dimensions: {
    txCount1h: number;
    txCount24h: number;
    amountSum1h: number;
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
  }): Promise<SignalBundle> {
    const { deviceId, entityId, merchantId, sessionId, ip, msisdn, billingCountry } = params;

    const [deviceResult, behavioralResult, networkResult, telcoResult, velocityResult] =
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
          this.fetchVelocitySignal(entityId, merchantId),
        ),
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
  ): Promise<VelocitySignal | null> {
    const baseUrl =
      this.config.get<string>('services.velocityUrl') ?? 'http://localhost:3004';
    const url = `${baseUrl}/v1/velocity/${encodeURIComponent(entityId)}`;
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
      dimensions: {
        txCount1h:        signals.txCount1h        ?? signals.tx_count_1h        ?? 0,
        txCount24h:       signals.txCount24h       ?? signals.tx_count_24h       ?? 0,
        amountSum1h:      signals.amountSum1h      ?? signals.amount_sum_1h      ?? 0,
        uniqueDevices24h: signals.uniqueDevices24h ?? signals.unique_devices_24h ?? 0,
        uniqueIps24h:     signals.uniqueIps24h     ?? signals.unique_ips_24h     ?? 0,
        uniqueSessions1h: signals.uniqueSessions1h ?? signals.unique_sessions_1h ?? 0,
      },
      burstDetected: (raw as any).burstDetected ?? (raw as any).burst_detected ?? false,
      burstRatio:    (raw as any).burstRatio    ?? (raw as any).burst_ratio,
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
