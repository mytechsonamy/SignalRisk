/**
 * FraudTester — SignalRisk Adapter
 *
 * Connects the FraudTester framework to a running SignalRisk instance.
 *
 * Real pipeline flow:
 *   1. POST /v1/events → event-collector → Kafka (signalrisk.events.raw)
 *   2. Kafka consumer in decision-service picks up the event
 *   3. decision-service fetches all signals (velocity, device, behavioral, network, telco)
 *   4. Scores the event → persists decision to PostgreSQL
 *   5. Adapter polls GET /v1/decisions/{eventId} until the decision is available
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
  /** Max poll attempts for decision (default: 30) */
  maxPollAttempts?: number;
  /** Poll interval in ms (default: 500) */
  pollIntervalMs?: number;
}

export class SignalRiskAdapter implements IFraudSystemAdapter {
  readonly name = 'SignalRisk';

  private readonly baseUrl: string;
  private readonly decisionUrl: string;
  private readonly apiKey: string;
  private readonly merchantId: string;
  private readonly maxPollAttempts: number;
  private readonly pollIntervalMs: number;

  constructor(private readonly config: SignalRiskAdapterConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.decisionUrl = (config.decisionUrl ?? config.baseUrl).replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.merchantId = config.merchantId;
    this.maxPollAttempts = config.maxPollAttempts ?? 30;
    this.pollIntervalMs = config.pollIntervalMs ?? 500;
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
   * Submit event through the real Kafka pipeline and poll for the decision.
   *
   * 1. POST /v1/events → event-collector → Kafka
   * 2. Poll GET /v1/decisions/{eventId} until the Kafka consumer has processed it
   */
  async submitEvent(event: FraudTestEvent): Promise<FraudDecision> {
    const start = Date.now();

    // Ingest event via event-collector (→ Kafka → decision-service consumer)
    const ingestRes = await fetch(`${this.baseUrl}/v1/events`, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: JSON.stringify({
        events: [
          {
            eventId: event.eventId,
            merchantId: event.merchantId,
            deviceId: event.deviceFingerprint,
            sessionId: event.userId || `sess-${event.eventId}`,
            type: 'PAYMENT',
            payload: {
              amount: event.amount ?? 0,
              currency: event.currency ?? 'TRY',
              paymentMethod: 'credit_card',
              ...event.metadata,
            },
            ipAddress: event.ipAddress,
          },
        ],
      }),
    });

    if (!ingestRes.ok && ingestRes.status !== 429) {
      const body = await ingestRes.text().catch(() => '');
      throw new Error(
        `SignalRiskAdapter: POST /v1/events failed with HTTP ${ingestRes.status}: ${body}`,
      );
    }

    // Poll for the decision from the Kafka consumer pipeline
    const decision = await this.pollDecision(event.eventId);

    if (decision) {
      return { ...decision, latencyMs: Date.now() - start };
    }

    // Pipeline didn't produce a decision within timeout — return a default ALLOW
    // This indicates the Kafka consumer hasn't processed the event yet
    return {
      eventId: event.eventId,
      decision: 'ALLOW',
      riskScore: 0,
      latencyMs: Date.now() - start,
      signals: { _timeout: 1 },
    };
  }

  /**
   * Poll GET /v1/decisions/{eventId} until the Kafka consumer pipeline
   * has processed the event and stored the decision in PostgreSQL.
   */
  private async pollDecision(eventId: string): Promise<FraudDecision | null> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      const result = await this.getDecision(eventId);
      if (result) return result;
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
    }
    return null;
  }

  /**
   * GET {decisionUrl}/v1/decisions/{eventId} — returns null on 404.
   */
  async getDecision(eventId: string): Promise<FraudDecision | null> {
    let res: Response;
    try {
      res = await fetch(
        `${this.decisionUrl}/v1/decisions/${encodeURIComponent(eventId)}`,
        { headers: this.defaultHeaders },
      );
    } catch {
      return null;
    }

    if (res.status === 404 || !res.ok) {
      return null;
    }

    const data = (await res.json()) as {
      requestId: string;
      action: 'ALLOW' | 'REVIEW' | 'BLOCK';
      riskScore: number;
      riskFactors?: Array<{ signal: string; value: number }>;
    };

    const signals: Record<string, number> = {};
    for (const factor of data.riskFactors ?? []) {
      signals[factor.signal] = typeof factor.value === 'number' ? factor.value : 0;
    }

    return {
      eventId,
      decision: data.action,
      riskScore: data.riskScore ?? 0,
      latencyMs: 0,
      signals,
    };
  }

  /**
   * No-op — SignalRisk does not expose a test-data reset endpoint.
   */
  async reset(): Promise<void> {
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
