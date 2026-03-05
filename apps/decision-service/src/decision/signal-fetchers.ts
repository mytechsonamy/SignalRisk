/**
 * SignalRisk Decision Service — Real HTTP Signal Fetchers
 *
 * Sprint 5: Real HTTP clients using native fetch (Node 18+) with
 * AbortController-based 150ms hard timeouts per downstream service.
 *
 * Graceful degradation: any network error, timeout, or non-2xx response
 * returns null — the orchestrator continues with remaining signals.
 */

import { Injectable } from '@nestjs/common';
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
// Internal helper: fetch with AbortController timeout
// ---------------------------------------------------------------------------

/**
 * Execute a fetch request with an AbortController timeout.
 * Returns null on timeout, network error, or non-2xx HTTP status.
 */
async function fetchWithTimeout<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 150,
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
  constructor(private readonly config: ConfigService) {}

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
  // Velocity signal — GET /v1/velocity/{entityId}?merchantId={merchantId}
  // -------------------------------------------------------------------------

  async fetchVelocitySignal(
    entityId: string,
    merchantId: string,
  ): Promise<VelocitySignal | null> {
    const baseUrl =
      this.config.get<string>('services.velocityUrl') ?? 'http://localhost:3004';
    const url = `${baseUrl}/v1/velocity/${encodeURIComponent(entityId)}?merchantId=${encodeURIComponent(merchantId)}`;
    return fetchWithTimeout<VelocitySignal>(url);
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
