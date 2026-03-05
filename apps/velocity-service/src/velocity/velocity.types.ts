/**
 * SignalRisk Velocity Engine — Type Definitions
 */

/** All 6 velocity signal dimensions. */
export interface VelocitySignals {
  /** Transaction count in the last 1 hour. */
  tx_count_1h: number;
  /** Transaction count in the last 24 hours. */
  tx_count_24h: number;
  /** Sum of transaction amounts (minor units) in the last 1 hour. */
  amount_sum_1h: number;
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
  /** Entity to track (e.g. card hash, account ID, IP). */
  entityId: string;
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
}

/** Batch velocity query response entry. */
export interface VelocityQueryResult {
  entityId: string;
  signals: VelocitySignals;
}
