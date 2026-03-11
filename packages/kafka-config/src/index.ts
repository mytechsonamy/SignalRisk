/**
 * SignalRisk — Shared Kafka Configuration
 *
 * Canonical topic names, consumer group IDs, and KafkaJS client factory
 * shared across all SignalRisk microservices.
 */

import { Kafka, KafkaConfig, logLevel } from 'kafkajs';

// ---------------------------------------------------------------------------
// Topic Names
// ---------------------------------------------------------------------------

export const TOPICS = {
  /** Main event stream -- all incoming transaction/signal events. */
  EVENTS_RAW: 'signalrisk.events.raw',
  /** Dead letter queue -- events that failed processing after retries. */
  EVENTS_DLQ: 'signalrisk.events.dlq',
  /** Decision events -- fraud/legitimate verdicts with scores. */
  DECISIONS: 'signalrisk.decisions',
  /** Rule update notifications -- broadcast when detection rules change. */
  RULES_CHANGES: 'signalrisk.rules.changes',
  /** Async telco enrichment -- SIM-swap, porting, carrier lookups. */
  ENRICHMENT_TELCO: 'signalrisk.enrichment.telco',
  /** Case creation events -- triggers for human review workflows. */
  CASES: 'signalrisk.cases',
  /** Webhook delivery -- outbound notifications to merchant endpoints. */
  WEBHOOKS: 'signalrisk.webhooks',
  /** Consent change events -- POPIA/GDPR consent grants & revocations. */
  CONSENT: 'signalrisk.consent',
  /** DLQ exhausted -- events that failed all retry attempts. */
  EVENTS_DLQ_EXHAUSTED: 'signalrisk.events.dlq.exhausted',
  /** Merchant lifecycle events -- onboarding, updates, deactivation. */
  MERCHANTS: 'signalrisk.merchants',
  /** Unrouted events -- events that could not be mapped to a known topic. */
  EVENTS_UNROUTED: 'signalrisk.events.unrouted',
  /** Analyst labels -- entity-level fraud/legitimate labels from case resolutions. */
  STATE_LABELS: 'signalrisk.state.labels',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

/** All topic names as an array (useful for admin operations). */
export const ALL_TOPICS: TopicName[] = Object.values(TOPICS);

// ---------------------------------------------------------------------------
// Consumer Group IDs
// ---------------------------------------------------------------------------

export const CONSUMER_GROUPS = {
  /** Decision engine consuming raw events. */
  DECISION_ENGINE: 'signalrisk.cg.decision-engine',
  /** Telco enrichment service consuming raw events. */
  ENRICHMENT_TELCO: 'signalrisk.cg.enrichment-telco',
  /** Case manager consuming decision events. */
  CASE_MANAGER: 'signalrisk.cg.case-manager',
  /** Webhook dispatcher consuming webhook events. */
  WEBHOOK_DISPATCHER: 'signalrisk.cg.webhook-dispatcher',
  /** Rules sync consuming rule change events. */
  RULES_SYNC: 'signalrisk.cg.rules-sync',
  /** Analytics pipeline consuming decisions. */
  ANALYTICS: 'signalrisk.cg.analytics',
  /** DLQ processor for manual reprocessing. */
  DLQ_PROCESSOR: 'signalrisk.cg.dlq-processor',
  /** Consent enforcer consuming consent events. */
  CONSENT_ENFORCER: 'signalrisk.cg.consent-enforcer',
  /** Notification service consuming case events. */
  NOTIFICATIONS: 'signalrisk.cg.notifications',
  /** State labels consumer -- processes analyst label events. */
  STATE_LABELS: 'signalrisk.cg.state-labels',
} as const;

export type ConsumerGroupId = (typeof CONSUMER_GROUPS)[keyof typeof CONSUMER_GROUPS];

// ---------------------------------------------------------------------------
// Kafka Client Factory
// ---------------------------------------------------------------------------

export interface SignalRiskKafkaOptions {
  /** Comma-separated bootstrap broker addresses (TLS). */
  brokers: string | string[];
  /** Unique client ID for this service instance. */
  clientId: string;
  /** Enable SSL/TLS (default: true). */
  ssl?: boolean;
  /** Optional SASL authentication config. */
  sasl?: KafkaConfig['sasl'];
  /** KafkaJS log level (default: ERROR). */
  logLevel?: logLevel;
}

/**
 * Creates a pre-configured KafkaJS client for SignalRisk services.
 *
 * @example
 * ```ts
 * import { createKafkaClient, TOPICS, CONSUMER_GROUPS } from '@signalrisk/kafka-config';
 *
 * const kafka = createKafkaClient({
 *   brokers: process.env.KAFKA_BROKERS!,
 *   clientId: 'decision-engine',
 * });
 *
 * const consumer = kafka.consumer({ groupId: CONSUMER_GROUPS.DECISION_ENGINE });
 * await consumer.subscribe({ topic: TOPICS.EVENTS_RAW, fromBeginning: false });
 * ```
 */
export function createKafkaClient(options: SignalRiskKafkaOptions): Kafka {
  const brokers =
    typeof options.brokers === 'string'
      ? options.brokers.split(',').map((b) => b.trim())
      : options.brokers;

  const config: KafkaConfig = {
    clientId: options.clientId,
    brokers,
    ssl: options.ssl ?? true,
    logLevel: options.logLevel ?? logLevel.ERROR,
    retry: {
      initialRetryTime: 300,
      retries: 10,
      maxRetryTime: 30000,
      factor: 2,
    },
    connectionTimeout: 10000,
    requestTimeout: 30000,
  };

  if (options.sasl) {
    config.sasl = options.sasl;
  }

  return new Kafka(config);
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export * from './types';
