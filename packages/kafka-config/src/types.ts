/**
 * SignalRisk — Kafka Event Type Definitions
 *
 * Shared interfaces for all event types flowing through the SignalRisk
 * Kafka event streams.
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

/** Base envelope for all SignalRisk Kafka messages. */
export interface BaseEvent {
  /** Unique event identifier (UUIDv4). */
  eventId: string;
  /** ISO-8601 timestamp of when the event was produced. */
  timestamp: string;
  /** Originating service name. */
  source: string;
  /** Schema version for forward-compatible deserialization. */
  schemaVersion: number;
  /** Optional correlation ID for distributed tracing. */
  correlationId?: string;
}

// ---------------------------------------------------------------------------
// Raw Event (signalrisk.events.raw)
// ---------------------------------------------------------------------------

export type TransactionChannel = 'card_present' | 'card_not_present' | 'mobile' | 'web' | 'api';

export interface RawEvent extends BaseEvent {
  /** Merchant-assigned transaction reference. */
  transactionId: string;
  /** Merchant identifier. */
  merchantId: string;
  /** Transaction amount in minor units (cents). */
  amountMinor: number;
  /** ISO-4217 currency code. */
  currency: string;
  /** Payment channel. */
  channel: TransactionChannel;
  /** IP address of the requestor (if available). */
  ipAddress?: string;
  /** Device fingerprint hash. */
  deviceFingerprint?: string;
  /** Additional merchant-supplied metadata. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Decision Event (signalrisk.decisions)
// ---------------------------------------------------------------------------

export type DecisionVerdict = 'approve' | 'decline' | 'review';

export interface RuleMatch {
  ruleId: string;
  ruleName: string;
  score: number;
  reason: string;
}

export interface DecisionEvent extends BaseEvent {
  /** Reference to the originating raw event. */
  transactionId: string;
  /** Final verdict. */
  verdict: DecisionVerdict;
  /** Composite risk score (0-1000). */
  riskScore: number;
  /** Rules that contributed to the decision. */
  matchedRules: RuleMatch[];
  /** Latency of the decision pipeline in milliseconds. */
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Rule Change Event (signalrisk.rules.changes)
// ---------------------------------------------------------------------------

export type RuleChangeAction = 'created' | 'updated' | 'deleted' | 'toggled';

export interface RuleChangeEvent extends BaseEvent {
  ruleId: string;
  action: RuleChangeAction;
  /** User who made the change. */
  changedBy: string;
  /** Snapshot of the rule after the change (null on delete). */
  ruleSnapshot?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Telco Enrichment Event (signalrisk.enrichment.telco)
// ---------------------------------------------------------------------------

export interface TelcoEnrichmentEvent extends BaseEvent {
  transactionId: string;
  msisdn: string;
  /** Whether a SIM swap was detected in the lookback window. */
  simSwapDetected: boolean;
  /** Days since last SIM swap (null if unknown). */
  simSwapAgeDays: number | null;
  /** Whether the number has been ported recently. */
  numberPorted: boolean;
  /** Mobile network operator name. */
  carrierName: string;
}

// ---------------------------------------------------------------------------
// Case Event (signalrisk.cases)
// ---------------------------------------------------------------------------

export type CasePriority = 'low' | 'medium' | 'high' | 'critical';

export interface CaseEvent extends BaseEvent {
  caseId: string;
  transactionId: string;
  merchantId: string;
  priority: CasePriority;
  /** Assigned analyst user ID (null if unassigned). */
  assignedTo: string | null;
  riskScore: number;
  summary: string;
}

// ---------------------------------------------------------------------------
// Webhook Event (signalrisk.webhooks)
// ---------------------------------------------------------------------------

export interface WebhookEvent extends BaseEvent {
  webhookId: string;
  merchantId: string;
  /** Target URL for delivery. */
  targetUrl: string;
  /** HTTP method. */
  method: 'POST' | 'PUT';
  /** Serialized payload to deliver. */
  payload: string;
  /** Number of delivery attempts so far. */
  attemptCount: number;
  /** Maximum allowed attempts. */
  maxAttempts: number;
}

// ---------------------------------------------------------------------------
// Consent Event (signalrisk.consent)
// ---------------------------------------------------------------------------

export type ConsentAction = 'granted' | 'revoked' | 'updated';
export type ConsentPurpose = 'fraud_detection' | 'marketing' | 'analytics' | 'data_sharing';

export interface ConsentEvent extends BaseEvent {
  /** Subject identifier (customer ID or MSISDN). */
  subjectId: string;
  action: ConsentAction;
  purposes: ConsentPurpose[];
  /** Legal basis (e.g., POPIA Section 11, GDPR Art. 6). */
  legalBasis: string;
  /** IP address from which consent was given/revoked. */
  ipAddress?: string;
}

// ---------------------------------------------------------------------------
// Dead-Letter Wrapper (signalrisk.events.dlq)
// ---------------------------------------------------------------------------

export interface DeadLetterEvent extends BaseEvent {
  /** The topic the original message came from. */
  originalTopic: string;
  /** The partition the original message was on. */
  originalPartition: number;
  /** The offset of the original message. */
  originalOffset: number;
  /** Serialized original message value. */
  originalValue: string;
  /** Error that caused the message to be dead-lettered. */
  errorMessage: string;
  /** Stack trace (if available). */
  errorStack?: string;
  /** Number of processing attempts before dead-lettering. */
  retryCount: number;
}
