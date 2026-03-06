/**
 * FraudTester — Mock Adapter
 *
 * A fully in-memory adapter that requires no running fraud system.
 * Useful for testing scenarios, reporters, and orchestration logic
 * without any network dependencies.
 *
 * Supported decision modes:
 *   always-block  — every event returns BLOCK
 *   always-allow  — every event returns ALLOW
 *   always-review — every event returns REVIEW
 *   random        — decision is randomly drawn (default)
 *   threshold     — riskScore > 0.7 → BLOCK, > 0.4 → REVIEW, else ALLOW
 *   custom        — caller-supplied function governs every decision
 */

import type { IFraudSystemAdapter, FraudTestEvent, FraudDecision } from './base.adapter';

export type MockDecisionMode =
  | 'always-block'   // tüm event'ler BLOCK
  | 'always-allow'   // tüm event'ler ALLOW
  | 'always-review'  // tüm event'ler REVIEW
  | 'random'         // rastgele karar
  | 'threshold'      // riskScore'a göre: >0.7=BLOCK, >0.4=REVIEW, else=ALLOW
  | 'custom';        // customFn ile kullanıcı tanımlı

export interface MockAdapterConfig {
  mode: MockDecisionMode;
  /** Risk score returned for every decision, 0–1. Defaults to Math.random(). */
  fixedRiskScore?: number;
  /** Simulated latency in milliseconds. Default 50. */
  fixedLatencyMs?: number;
  /** Required when mode === 'custom'. Receives the full event, returns a partial FraudDecision. */
  customFn?: (event: FraudTestEvent) => Partial<FraudDecision>;
}

export class MockAdapter implements IFraudSystemAdapter {
  readonly name = 'MockAdapter';

  private readonly decisions = new Map<string, FraudDecision>();

  constructor(private readonly config: MockAdapterConfig = { mode: 'random' }) {}

  async submitEvent(event: FraudTestEvent): Promise<FraudDecision> {
    const decision = this.generateDecision(event);
    this.decisions.set(event.eventId, decision);
    return decision;
  }

  async getDecision(eventId: string): Promise<FraudDecision | null> {
    return this.decisions.get(eventId) ?? null;
  }

  async reset(): Promise<void> {
    this.decisions.clear();
  }

  async healthCheck(): Promise<boolean> {
    return true; // her zaman healthy
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private generateDecision(event: FraudTestEvent): FraudDecision {
    const latencyMs = this.config.fixedLatencyMs ?? 50;
    const riskScore = this.config.fixedRiskScore ?? Math.random();

    switch (this.config.mode) {
      case 'always-block':
        return { eventId: event.eventId, decision: 'BLOCK', riskScore, latencyMs };

      case 'always-allow':
        return { eventId: event.eventId, decision: 'ALLOW', riskScore, latencyMs };

      case 'always-review':
        return { eventId: event.eventId, decision: 'REVIEW', riskScore, latencyMs };

      case 'threshold': {
        const d: 'ALLOW' | 'REVIEW' | 'BLOCK' =
          riskScore > 0.7 ? 'BLOCK' : riskScore > 0.4 ? 'REVIEW' : 'ALLOW';
        return { eventId: event.eventId, decision: d, riskScore, latencyMs };
      }

      case 'custom': {
        if (!this.config.customFn) {
          throw new Error("MockAdapter: 'custom' mode requires a customFn to be provided");
        }
        const partial = this.config.customFn(event);
        return {
          eventId: event.eventId,
          decision: 'ALLOW',
          riskScore: 0.5,
          latencyMs,
          ...partial,
        };
      }

      default: {
        // 'random'
        const r = Math.random();
        const d: 'ALLOW' | 'REVIEW' | 'BLOCK' =
          r > 0.7 ? 'BLOCK' : r > 0.4 ? 'REVIEW' : 'ALLOW';
        return { eventId: event.eventId, decision: d, riskScore, latencyMs };
      }
    }
  }
}
