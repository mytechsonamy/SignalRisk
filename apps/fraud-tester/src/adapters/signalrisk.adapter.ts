/**
 * FraudTester — SignalRisk Adapter
 *
 * Connects the FraudTester framework to a running SignalRisk instance.
 * Submits events via POST /v1/events (event-collector, default port 3002)
 * and polls GET /v1/decisions/{eventId} (decision-service, default port 3009)
 * with a maximum of 10 attempts at 100ms intervals.
 *
 * Uses Node 18+ built-in fetch — no external HTTP library required.
 */

import type { FraudDecision, FraudTestEvent, IFraudSystemAdapter } from './base.adapter';

export interface SignalRiskAdapterConfig {
  /** Event Collector base URL, e.g. http://localhost:3002 */
  baseUrl: string;
  /** API key in sk_test_<32hex> format */
  apiKey: string;
  merchantId: string;
  /** Decision Service base URL, e.g. http://localhost:3009 (defaults to baseUrl) */
  decisionUrl?: string;
}

const MAX_POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 100;

export class SignalRiskAdapter implements IFraudSystemAdapter {
  readonly name = 'SignalRisk';

  private readonly baseUrl: string;
  private readonly decisionUrl: string;
  private readonly apiKey: string;
  private readonly merchantId: string;

  constructor(private readonly config: SignalRiskAdapterConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.decisionUrl = (config.decisionUrl ?? config.baseUrl).replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.merchantId = config.merchantId;
  }

  private get defaultHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Merchant-ID': this.merchantId,
      'X-SignalRisk-Test': 'true',
    };
  }

  /**
   * POST /v1/events then poll /v1/decisions/{eventId} up to MAX_POLL_ATTEMPTS times.
   * latencyMs covers the full round-trip from submit to decision receipt.
   */
  async submitEvent(event: FraudTestEvent): Promise<FraudDecision> {
    const start = Date.now();

    const submitRes = await fetch(`${this.baseUrl}/v1/events`, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: JSON.stringify({
        events: [
          {
            eventId: event.eventId,
            merchantId: event.merchantId,
            deviceFingerprint: event.deviceFingerprint,
            userId: event.userId,
            ipAddress: event.ipAddress,
            amount: event.amount,
            currency: event.currency,
            metadata: event.metadata,
          },
        ],
      }),
    });

    if (!submitRes.ok) {
      throw new Error(
        `SignalRiskAdapter: POST /v1/events failed with HTTP ${submitRes.status}`,
      );
    }

    // Poll for the decision
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      const decision = await this.getDecision(event.eventId);
      if (decision !== null) {
        return {
          ...decision,
          latencyMs: Date.now() - start,
        };
      }
    }

    throw new Error(
      `SignalRiskAdapter: decision for eventId '${event.eventId}' not available after ${MAX_POLL_ATTEMPTS} polls`,
    );
  }

  /**
   * GET {decisionUrl}/v1/decisions/{eventId} — returns null on 404.
   */
  async getDecision(eventId: string): Promise<FraudDecision | null> {
    const start = Date.now();

    let res: Response;
    try {
      res = await fetch(
        `${this.decisionUrl}/v1/decisions/${encodeURIComponent(eventId)}`,
        { headers: this.defaultHeaders },
      );
    } catch {
      return null;
    }

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as {
      requestId: string;
      action: 'ALLOW' | 'REVIEW' | 'BLOCK';
      riskScore: number;
      riskFactors?: Array<{ signal: string; value: number }>;
    };

    // Normalize SignalRisk response shape → FraudDecision
    const signals: Record<string, number> = {};
    for (const factor of data.riskFactors ?? []) {
      signals[factor.signal] = typeof factor.value === 'number' ? factor.value : 0;
    }

    return {
      eventId,
      decision: data.action,
      riskScore: data.riskScore,
      latencyMs: Date.now() - start,
      signals,
    };
  }

  /**
   * No-op — SignalRisk does not expose a test-data reset endpoint.
   * TODO: add DELETE /v1/test-data endpoint in a future sprint.
   */
  async reset(): Promise<void> {
    // No-op: SignalRisk test data temizleme yok
    // TODO: gelecekte DELETE /v1/test-data endpoint'i eklenebilir
    return;
  }

  /**
   * GET {baseUrl}/health — returns true when the response status is 200.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      return res.status === 200;
    } catch {
      return false;
    }
  }
}
