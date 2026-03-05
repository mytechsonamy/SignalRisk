import { metrics, Histogram, Counter, Meter } from '@opentelemetry/api';

export interface SignalRiskMetrics {
  /** Histogram tracking fraud decision latency in milliseconds */
  decisionLatency: Histogram;
  /** Counter tracking total events processed (by type) */
  eventThroughput: Counter;
  /** Counter tracking errors (by service and error type) */
  errorRate: Counter;
  /** Histogram tracking rule evaluation duration */
  ruleEvalDuration: Histogram;
  /** Counter tracking fraud decisions (by verdict: allow, block, review) */
  decisionCount: Counter;
}

let metricsInstance: SignalRiskMetrics | null = null;

export function initMetrics(serviceName: string): SignalRiskMetrics {
  if (metricsInstance) return metricsInstance;

  const meter: Meter = metrics.getMeter(serviceName, '1.0.0');

  metricsInstance = {
    decisionLatency: meter.createHistogram('signalrisk.decision.latency_ms', {
      description: 'Fraud decision latency in milliseconds',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
      },
    }),

    eventThroughput: meter.createCounter('signalrisk.events.throughput', {
      description: 'Total events processed',
      unit: '{events}',
    }),

    errorRate: meter.createCounter('signalrisk.errors.total', {
      description: 'Total errors by service and type',
      unit: '{errors}',
    }),

    ruleEvalDuration: meter.createHistogram('signalrisk.rule.eval_duration_ms', {
      description: 'Rule evaluation duration in milliseconds',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [1, 5, 10, 25, 50, 100, 250],
      },
    }),

    decisionCount: meter.createCounter('signalrisk.decisions.total', {
      description: 'Total fraud decisions by verdict',
      unit: '{decisions}',
    }),
  };

  return metricsInstance;
}

export function getMetrics(): SignalRiskMetrics {
  if (!metricsInstance) {
    throw new Error('Metrics not initialized. Call initMetrics(serviceName) first.');
  }
  return metricsInstance;
}

/** Record a fraud decision with latency */
export function recordDecision(
  verdict: 'allow' | 'block' | 'review',
  latencyMs: number,
  attributes: Record<string, string> = {},
): void {
  const m = getMetrics();
  m.decisionLatency.record(latencyMs, { verdict, ...attributes });
  m.decisionCount.add(1, { verdict, ...attributes });
}

/** Record an event processed */
export function recordEvent(eventType: string, attributes: Record<string, string> = {}): void {
  const m = getMetrics();
  m.eventThroughput.add(1, { event_type: eventType, ...attributes });
}

/** Record an error */
export function recordError(
  service: string,
  errorType: string,
  attributes: Record<string, string> = {},
): void {
  const m = getMetrics();
  m.errorRate.add(1, { service, error_type: errorType, ...attributes });
}
