/**
 * SignalRisk Decision Service — Mock Signal Fetchers
 *
 * Sprint 4: Mock implementations returning synthetic data based on request fields.
 * Sprint 5: These will be replaced with real HTTP calls to downstream services.
 */

import { DecisionRequest } from './decision.types';

// Signal types inline for Sprint 4 (Sprint 5 will import from @signalrisk/signal-contracts)
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

/**
 * Fetch device signal from device-intel-service.
 * Returns mock data based on deviceId presence.
 */
export async function fetchDeviceSignal(req: DecisionRequest): Promise<DeviceSignal | null> {
  if (!req.deviceId) return null;

  return {
    deviceId: req.deviceId,
    merchantId: req.merchantId,
    fingerprint: 'mock-fingerprint-' + req.deviceId,
    trustScore: 65,
    isEmulator: false,
    emulatorConfidence: 0.05,
    platform: 'web',
    firstSeenAt: new Date(Date.now() - 30 * 86_400_000), // 30 days ago
    lastSeenAt: new Date(),
    daysSinceFirstSeen: 30,
  };
}

/**
 * Fetch velocity signal from velocity-engine service.
 * Returns mock data based on entityId presence.
 */
export async function fetchVelocitySignal(req: DecisionRequest): Promise<VelocitySignal | null> {
  if (!req.entityId) return null;

  return {
    entityId: req.entityId,
    merchantId: req.merchantId,
    dimensions: {
      txCount1h: 3,
      txCount24h: 12,
      amountSum1h: req.amount ? req.amount * 3 : 150,
      uniqueDevices24h: 1,
      uniqueIps24h: 1,
      uniqueSessions1h: 1,
    },
    burstDetected: false,
    burstDimension: undefined,
    burstRatio: undefined,
  };
}

/**
 * Fetch behavioral signal from behavioral-service.
 * Returns mock data based on sessionId presence.
 */
export async function fetchBehavioralSignal(req: DecisionRequest): Promise<BehavioralSignal | null> {
  if (!req.sessionId) return null;

  return {
    sessionId: req.sessionId,
    merchantId: req.merchantId,
    sessionRiskScore: 20,
    botProbability: 0.05,
    isBot: false,
    indicators: [],
    timingCv: 0.45,
    navigationEntropy: 3.2,
  };
}

/**
 * Fetch network signal from network-intel-service.
 * Returns mock data based on ip presence.
 */
export async function fetchNetworkSignal(req: DecisionRequest): Promise<NetworkSignal | null> {
  if (!req.ip) return null;

  return {
    ip: req.ip,
    merchantId: req.merchantId,
    country: req.billingCountry || 'TR',
    city: 'Istanbul',
    asn: 'AS9121',
    isProxy: false,
    isVpn: false,
    isTor: false,
    isDatacenter: false,
    geoMismatchScore: 0,
    riskScore: 15,
  };
}

/**
 * Fetch telco signal from telco-service.
 * Returns mock data based on msisdn presence.
 */
export async function fetchTelcoSignal(req: DecisionRequest): Promise<TelcoSignal | null> {
  if (!req.msisdn) return null;

  return {
    msisdn: req.msisdn,
    merchantId: req.merchantId,
    operator: 'Turkcell',
    lineType: 'postpaid',
    isPorted: false,
    portDate: undefined,
    prepaidProbability: 0.1,
    countryCode: 'TR',
  };
}
