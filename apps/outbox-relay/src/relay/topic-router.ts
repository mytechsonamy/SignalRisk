/**
 * Maps aggregate_type + event_type from outbox_events rows
 * to the target Kafka topic.
 */

import { TOPICS } from '@signalrisk/kafka-config';

const TOPIC_MAP: Record<string, Record<string, string>> = {
  DECISION: {
    created: TOPICS.DECISIONS,
    updated: TOPICS.DECISIONS,
  },
  DEVICE: {
    created: TOPICS.EVENTS_RAW,
    updated: TOPICS.EVENTS_RAW,
  },
  RULE: {
    created: TOPICS.RULES_CHANGES,
    changed: TOPICS.RULES_CHANGES,
    deleted: TOPICS.RULES_CHANGES,
  },
  EVENT: {
    created: TOPICS.EVENTS_RAW,
  },
  MERCHANT: {
    created: TOPICS.MERCHANTS,
    updated: TOPICS.MERCHANTS,
  },
};

const DEFAULT_TOPIC = TOPICS.EVENTS_UNROUTED;

export function resolveTopicForEvent(
  aggregateType: string,
  eventType: string,
): string {
  const byEvent = TOPIC_MAP[aggregateType];
  if (!byEvent) {
    return DEFAULT_TOPIC;
  }
  return byEvent[eventType] ?? DEFAULT_TOPIC;
}
