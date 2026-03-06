export { initTracing, shutdownTracing, TracingConfig } from './tracing';
export { injectTraceContext, extractTraceContext, startConsumerSpan } from './kafka-propagation';
export {
  initMetrics,
  getMetrics,
  recordDecision,
  recordEvent,
  recordError,
  SignalRiskMetrics,
} from './metrics';
export { createLogger, createChildLogger, LoggingConfig } from './logging';

import { initTracing, TracingConfig } from './tracing';
import { initMetrics } from './metrics';
import { createLogger, LoggingConfig } from './logging';
import { Logger } from 'pino';

export interface TelemetryConfig extends TracingConfig, Partial<LoggingConfig> {}

export interface TelemetryInstance {
  logger: Logger;
  shutdown: () => Promise<void>;
}

/**
 * Initialize all telemetry: tracing, metrics, and structured logging.
 *
 * Call this at the very top of your service entry point, before any
 * NestJS bootstrap or other imports.
 *
 * @example
 * ```ts
 * import { initTelemetry } from '@signalrisk/telemetry';
 *
 * const { logger, shutdown } = initTelemetry({ serviceName: 'decision-engine' });
 *
 * async function bootstrap() {
 *   const app = await NestFactory.create(AppModule);
 *   app.enableShutdownHooks();
 *   await app.listen(3000);
 *   logger.info('Service started on port 3000');
 * }
 *
 * bootstrap();
 * ```
 */
export function initTelemetry(config: TelemetryConfig): TelemetryInstance {
  const sdk = initTracing(config);
  initMetrics(config.serviceName);

  const logger = createLogger({
    serviceName: config.serviceName,
    level: config.level,
    pretty: config.pretty ?? process.env.NODE_ENV !== 'production',
  });

  logger.info(
    {
      otlpEndpoint: config.otlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4317',
    },
    `Telemetry initialized for ${config.serviceName}`,
  );

  return {
    logger,
    shutdown: () => sdk.shutdown(),
  };
}
