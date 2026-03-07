/**
 * FraudTester — Generic HTTP Adapter
 *
 * Connects the FraudTester framework to any HTTP-based fraud system.
 * Fully configurable via endpoint mappings and response field mappings,
 * supporting nested dot-notation paths for response normalization.
 *
 * Uses Node 18+ built-in fetch — no external HTTP library required.
 */

import type { FraudDecision, FraudTestEvent, IFraudSystemAdapter } from './base.adapter';

export interface EndpointMapping {
  /** e.g. '/v1/events' or '/api/fraud/check' */
  submitEvent: string;
  /** e.g. '/v1/decisions/{eventId}' — {eventId} placeholder is replaced */
  getDecision: string;
  /** e.g. '/health' or '/api/status' */
  healthCheck: string;
  /** Optional reset endpoint. If absent, reset() is a no-op. */
  reset?: string;
}

export interface GenericAdapterConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  /** Header name for the API key. Defaults to 'X-API-Key'. */
  apiKeyHeader?: string;
  /** Header name for the merchant ID. Defaults to 'X-Merchant-ID'. */
  merchantIdHeader?: string;
  merchantId?: string;
  endpoints: EndpointMapping;
  /**
   * Response field mapping — supports dot notation for nested fields,
   * e.g. 'result.action' or 'risk.value'.
   */
  responseMapping: {
    /** e.g. 'decision' or 'result.action' or 'outcome' */
    decisionField: string;
    /** e.g. 'riskScore' or 'score' or 'risk.value' */
    riskScoreField: string;
    /** e.g. 'eventId' or 'id' or 'requestId' */
    eventIdField?: string;
  };
  /** Request timeout in milliseconds. Defaults to 5000. */
  timeoutMs?: number;
}

export class GenericHttpAdapter implements IFraudSystemAdapter {
  readonly name: string;

  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: GenericAdapterConfig) {
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  // ---------------------------------------------------------------------------
  // IFraudSystemAdapter implementation
  // ---------------------------------------------------------------------------

  /**
   * POST config.endpoints.submitEvent with the event payload.
   * Extracts decision and riskScore from the response using responseMapping.
   * Returns a normalized FraudDecision.
   */
  async submitEvent(event: FraudTestEvent): Promise<FraudDecision> {
    const start = Date.now();
    const url = `${this.baseUrl}${this.config.endpoints.submitEvent}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        eventId: event.eventId,
        merchantId: event.merchantId,
        deviceFingerprint: event.deviceFingerprint,
        userId: event.userId,
        ipAddress: event.ipAddress,
        amount: event.amount,
        currency: event.currency,
        metadata: event.metadata,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      throw new Error(
        `GenericHttpAdapter(${this.name}): POST ${url} failed with HTTP ${res.status}`,
      );
    }

    const body = (await res.json()) as Record<string, unknown>;
    const mapping = this.config.responseMapping;

    return {
      eventId: event.eventId,
      decision: this.normalizeDecision(this.extractField(body, mapping.decisionField)),
      riskScore: parseFloat(String(this.extractField(body, mapping.riskScoreField))) || 0.5,
      latencyMs: Date.now() - start,
      signals: {},
    };
  }

  /**
   * GET config.endpoints.getDecision with {eventId} replaced.
   * Returns null on 404 or network failure.
   */
  async getDecision(eventId: string): Promise<FraudDecision | null> {
    const start = Date.now();
    const path = this.config.endpoints.getDecision.replace(
      '{eventId}',
      encodeURIComponent(eventId),
    );
    const url = `${this.baseUrl}${path}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return null;
    }

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      return null;
    }

    const body = (await res.json()) as Record<string, unknown>;
    const mapping = this.config.responseMapping;

    return {
      eventId,
      decision: this.normalizeDecision(this.extractField(body, mapping.decisionField)),
      riskScore: parseFloat(String(this.extractField(body, mapping.riskScoreField))) || 0.5,
      latencyMs: Date.now() - start,
      signals: {},
    };
  }

  /**
   * Calls config.endpoints.reset if defined; otherwise no-op.
   */
  async reset(): Promise<void> {
    if (!this.config.endpoints.reset) {
      return;
    }

    const url = `${this.baseUrl}${this.config.endpoints.reset}`;
    try {
      await fetch(url, {
        method: 'DELETE',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // Swallow errors — reset is best-effort
    }
  }

  /**
   * GET config.endpoints.healthCheck.
   * Returns true on any 2xx response, false on timeout or error.
   */
  async healthCheck(): Promise<boolean> {
    const url = `${this.baseUrl}${this.config.endpoints.healthCheck}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const apiKeyHeader = this.config.apiKeyHeader ?? 'X-API-Key';
    if (this.config.apiKey) {
      headers[apiKeyHeader] = this.config.apiKey;
    }

    const merchantIdHeader = this.config.merchantIdHeader ?? 'X-Merchant-ID';
    if (this.config.merchantId) {
      headers[merchantIdHeader] = this.config.merchantId;
    }

    return headers;
  }

  /**
   * Extracts a (potentially nested) value from an object using dot notation.
   * e.g. extractField(obj, 'result.action') returns obj.result.action
   */
  private extractField(obj: unknown, path: string): unknown {
    return path
      .split('.')
      .reduce((acc: unknown, key: string) => (acc as Record<string, unknown>)?.[key], obj);
  }

  /**
   * Normalizes vendor-specific decision strings to the canonical
   * 'ALLOW' | 'REVIEW' | 'BLOCK' union.
   *
   * BLOCK aliases:  BLOCK, DENY, REJECT, FRAUD
   * REVIEW aliases: REVIEW, CHALLENGE, MANUAL, PENDING
   * Everything else maps to ALLOW.
   */
  private normalizeDecision(raw: unknown): 'ALLOW' | 'REVIEW' | 'BLOCK' {
    const upper = String(raw ?? '').toUpperCase();
    if (['BLOCK', 'DENY', 'REJECT', 'FRAUD'].includes(upper)) return 'BLOCK';
    if (['REVIEW', 'CHALLENGE', 'MANUAL', 'PENDING'].includes(upper)) return 'REVIEW';
    return 'ALLOW';
  }
}
