/**
 * FraudTester — Base Adapter Interface
 *
 * Defines the contract that every fraud-system adapter must satisfy.
 * Adapters normalize the target system's request/response format so
 * that scenarios and the orchestrator remain system-agnostic.
 */

export interface FraudTestEvent {
  eventId: string;
  merchantId: string;
  deviceFingerprint: string;
  userId: string;
  ipAddress?: string;
  amount?: number;
  currency?: string;
  metadata: Record<string, unknown>;
}

export interface FraudDecision {
  eventId: string;
  decision: 'ALLOW' | 'REVIEW' | 'BLOCK';
  /** Risk score in the range 0–1. */
  riskScore: number;
  latencyMs: number;
  signals?: Record<string, number>;
}

export interface IFraudSystemAdapter {
  readonly name: string;

  /**
   * Submit a fraud test event to the target system and return the decision.
   * Implementations should poll internally until a decision is available.
   */
  submitEvent(event: FraudTestEvent): Promise<FraudDecision>;

  /**
   * Retrieve a previously-submitted decision by event ID.
   * Returns null if not found or unavailable.
   */
  getDecision(eventId: string): Promise<FraudDecision | null>;

  /**
   * Reset test state in the target system (e.g., clear counters, caches).
   * Not all systems support this — implementations may no-op with a TODO.
   */
  reset(): Promise<void>;

  /**
   * Verify the target system is reachable and healthy.
   */
  healthCheck(): Promise<boolean>;
}
