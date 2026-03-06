/**
 * FraudTester — Chaos Adapter Wrapper
 *
 * Decorates any IFraudSystemAdapter with failure injection behaviour so that
 * ChaosAgent can test system resilience without modifying the real adapter.
 *
 * Supported modes:
 *   timeout        — races submitEvent against a timer; throws on timeout
 *   partialFailure — randomly throws on a configurable fraction of calls
 *   stress         — adds an artificial delay before every submitEvent call
 */

import type { FraudDecision, FraudTestEvent, IFraudSystemAdapter } from './base.adapter';

export interface ChaosConfig {
  type: 'timeout' | 'partialFailure' | 'stress';
  /** timeout mode: milliseconds before the request is considered timed out (default 5000). */
  timeoutMs?: number;
  /** partialFailure mode: fraction of calls that throw an error, 0–1 (default 0.3). */
  failureRate?: number;
  /** stress mode: artificial delay added before each submitEvent call in ms (default 100). */
  delayMs?: number;
}

export class ChaosAdapterWrapper implements IFraudSystemAdapter {
  readonly name: string;

  constructor(
    private readonly inner: IFraudSystemAdapter,
    private readonly config: ChaosConfig,
  ) {
    this.name = `ChaosWrapper(${inner.name})`;
  }

  async submitEvent(event: FraudTestEvent): Promise<FraudDecision> {
    const { type, timeoutMs = 5000, failureRate = 0.3, delayMs = 100 } = this.config;

    if (type === 'timeout') {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs),
      );
      return Promise.race([this.inner.submitEvent(event), timeoutPromise]);
    }

    if (type === 'partialFailure') {
      if (Math.random() < failureRate) {
        throw new Error('injected failure');
      }
      return this.inner.submitEvent(event);
    }

    if (type === 'stress') {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      return this.inner.submitEvent(event);
    }

    // Fallback — no chaos
    return this.inner.submitEvent(event);
  }

  async getDecision(eventId: string): Promise<FraudDecision | null> {
    return this.inner.getDecision(eventId);
  }

  async reset(): Promise<void> {
    return this.inner.reset();
  }

  async healthCheck(): Promise<boolean> {
    return this.inner.healthCheck();
  }
}
