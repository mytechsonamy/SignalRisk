/**
 * Maps aggregate_type + event_type from outbox_events rows
 * to the target Kafka topic.
 */

const TOPIC_MAP: Record<string, Record<string, string>> = {
  DECISION: {
    created: 'signalrisk.decisions',
    updated: 'signalrisk.decisions',
  },
  DEVICE: {
    created: 'signalrisk.events.raw',
    updated: 'signalrisk.events.raw',
  },
  RULE: {
    created: 'signalrisk.rules.changes',
    changed: 'signalrisk.rules.changes',
    deleted: 'signalrisk.rules.changes',
  },
  EVENT: {
    created: 'signalrisk.events.raw',
  },
  MERCHANT: {
    created: 'signalrisk.merchants',
    updated: 'signalrisk.merchants',
  },
};

const DEFAULT_TOPIC = 'signalrisk.events.unrouted';

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
