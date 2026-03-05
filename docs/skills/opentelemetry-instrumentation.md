# Skill: opentelemetry-instrumentation

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | BACKEND_NODE, DEVOPS |
| **Category** | observability |

## Description
OpenTelemetry instrumentation for all SignalRisk services. Covers traces, metrics, and structured logging. Exports to Prometheus (metrics) and Grafana (dashboards). Every service must be instrumented from day 1.

## Patterns
- OpenTelemetry SDK for NestJS (auto-instrumentation + custom spans)
- Prometheus metrics endpoint at `/metrics` on every service
- Custom metrics: decision latency histogram, event throughput counter, FPR gauge
- Distributed tracing: trace ID propagated through HTTP headers and Kafka message headers
- Structured logging with trace/span IDs for correlation
- Grafana dashboards: decision latency, throughput, FPR, queue depth, tenant health

## Architecture Reference
architecture-v3.md#1.3 (Monitoring: Prometheus + Grafana + PagerDuty)

## Code Examples
```typescript
// Bootstrap telemetry (before NestJS app creation)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';

const sdk = new NodeSDK({
  metricReader: new PrometheusExporter({ port: 9464 }),
  instrumentations: [
    new HttpInstrumentation(),
    new NestInstrumentation(),
  ],
});
sdk.start();

// Custom metrics
const decisionLatency = meter.createHistogram('signalrisk.decision.latency_ms', {
  description: 'Decision API latency in milliseconds',
  unit: 'ms',
});

const decisionCounter = meter.createCounter('signalrisk.decision.total', {
  description: 'Total decisions made',
});

// Usage in service
async makeDecision(request: DecisionRequest): Promise<DecisionResponse> {
  const start = Date.now();
  const span = tracer.startSpan('decision.evaluate');
  try {
    const result = await this.evaluate(request);
    decisionCounter.add(1, { outcome: result.decision, merchant: request.merchantId });
    return result;
  } finally {
    decisionLatency.record(Date.now() - start);
    span.end();
  }
}
```

## Constraints
- Every service MUST expose `/metrics` endpoint for Prometheus scraping
- Trace ID must propagate through Kafka message headers (not just HTTP)
- Custom metrics naming convention: `signalrisk.{service}.{metric_name}`
- Never log PII (device fingerprints, MSISDNs) -- use hashed identifiers in logs
- PagerDuty alert routing: P0 = decision API down, P1 = latency > 500ms, P2 = FPR > threshold
