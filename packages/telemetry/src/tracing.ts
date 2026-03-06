import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import {
  CompositePropagator,
  W3CTraceContextPropagator,
  W3CBaggagePropagator,
} from '@opentelemetry/core';

export interface TracingConfig {
  serviceName: string;
  serviceVersion?: string;
  otlpEndpoint?: string;
  metricsIntervalMs?: number;
}

let sdk: NodeSDK | null = null;

export function initTracing(config: TracingConfig): NodeSDK {
  const {
    serviceName,
    serviceVersion = '1.0.0',
    otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4317',
    metricsIntervalMs = 15000,
  } = config;

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    'deployment.environment': process.env.NODE_ENV || 'development',
  });

  // Use OTLP/gRPC exporter — points to Jaeger when OTEL_EXPORTER_OTLP_ENDPOINT is set,
  // or falls back to the otel-collector default.
  const traceExporter = new OTLPTraceExporter({ url: otlpEndpoint });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: otlpEndpoint }),
    exportIntervalMillis: metricsIntervalMs,
  });

  const propagator = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    textMapPropagator: propagator,
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => {
          // Ignore health check and metrics endpoints
          const url = req.url || '';
          return url === '/health' || url === '/metrics' || url === '/readiness';
        },
      }),
      new NestInstrumentation(),
      new PgInstrumentation({
        enhancedDatabaseReporting: true,
      }),
      new IORedisInstrumentation(),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk?.shutdown().catch(console.error);
  });

  return sdk;
}

export function shutdownTracing(): Promise<void> {
  if (sdk) {
    return sdk.shutdown();
  }
  return Promise.resolve();
}
