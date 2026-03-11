/**
 * SignalRisk Velocity Engine — Type Definitions
 *
 * Sprint 1 (Stateful Fraud): Added EntityType for typed counters.
 * ADR-009: customer/device/ip typed entities.
 */

/** Entity types for multi-entity velocity tracking (ADR-009). */
export type EntityType = 'customer' | 'device' | 'ip';

/** All velocity signal dimensions. */
export interface VelocitySignals {
  /** Transaction count in the last 10 minutes. */
  tx_count_10m: number;
  /** Transaction count in the last 1 hour. */
  tx_count_1h: number;
  /** Transaction count in the last 24 hours. */
  tx_count_24h: number;
  /** Sum of transaction amounts (minor units) in the last 1 hour. */
  amount_sum_1h: number;
  /** Sum of transaction amounts (minor units) in the last 24 hours. */
  amount_sum_24h: number;
  /** Unique device count in the last 24 hours (HyperLogLog estimate). */
  unique_devices_24h: number;
  /** Unique IP count in the last 24 hours (HyperLogLog estimate). */
  unique_ips_24h: number;
  /** Unique session count in the last 1 hour (HyperLogLog estimate). */
  unique_sessions_1h: number;
  /** Whether a burst was detected on any dimension. */
  burst_detected: boolean;
}

/** Input event for velocity counter updates. */
export interface VelocityEvent {
  /** Unique event/transaction ID. */
  eventId: string;
  /** Merchant identifier for tenant isolation. */
  merchantId: string;
  /** Entity to track. */
  entityId: string;
  /** Entity type for typed counters (ADR-009). Defaults to 'customer'. */
  entityType: EntityType;
  /** Transaction amount in minor units (cents). */
  amountMinor: number;
  /** Device fingerprint hash (if available). */
  deviceFingerprint?: string;
  /** IP address (if available). */
  ipAddress?: string;
  /** Session ID (if available). */
  sessionId?: string;
  /** Event timestamp in epoch seconds. */
  timestampSeconds: number;
}

/** Burst detection result. */
export interface BurstResult {
  /** Whether any dimension exceeds the multiplier threshold. */
  detected: boolean;
  /** Which dimensions triggered the burst. */
  dimensions: string[];
  /** The highest multiplier observed across dimensions. */
  multiplier: number;
}

/** Batch velocity query request. */
export interface VelocityQueryRequest {
  merchantId: string;
  entityIds: string[];
  /** Entity type filter. Defaults to 'customer'. */
  entityType?: EntityType;
}

/** Batch velocity query response entry. */
export interface VelocityQueryResult {
  entityId: string;
  entityType: EntityType;
  signals: VelocitySignals;
}
