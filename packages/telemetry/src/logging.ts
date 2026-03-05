import pino, { Logger, LoggerOptions } from 'pino';
import { trace, context, SpanContext } from '@opentelemetry/api';

export interface LoggingConfig {
  serviceName: string;
  level?: string;
  pretty?: boolean;
}

/**
 * Extract trace context (traceId, spanId) from the current OpenTelemetry span
 * for log correlation.
 */
function getTraceContext(): { traceId?: string; spanId?: string; traceFlags?: number } {
  const span = trace.getSpan(context.active());
  if (!span) return {};

  const spanContext: SpanContext = span.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
  };
}

/**
 * Creates a structured Pino logger with automatic trace/span ID correlation.
 * Every log line includes traceId and spanId when an active span exists.
 */
export function createLogger(config: LoggingConfig): Logger {
  const { serviceName, level = process.env.LOG_LEVEL || 'info', pretty = false } = config;

  const options: LoggerOptions = {
    level,
    base: {
      service: serviceName,
      pid: process.pid,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
    mixin() {
      return getTraceContext();
    },
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          },
        }
      : {}),
  };

  return pino(options);
}

/**
 * Creates a child logger with additional bound context fields.
 */
export function createChildLogger(
  parent: Logger,
  bindings: Record<string, unknown>,
): Logger {
  return parent.child(bindings);
}
