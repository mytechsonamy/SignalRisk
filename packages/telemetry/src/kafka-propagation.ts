import { propagation, context, trace, SpanKind } from '@opentelemetry/api';
import { TextMapSetter, TextMapGetter } from '@opentelemetry/api';

// Kafka message headers as a string map
type KafkaHeaders = Record<string, string>;

const kafkaSetter: TextMapSetter<KafkaHeaders> = {
  set(carrier, key, value) {
    carrier[key] = value;
  },
};

const kafkaGetter: TextMapGetter<KafkaHeaders> = {
  get(carrier, key) {
    return carrier[key];
  },
  keys(carrier) {
    return Object.keys(carrier);
  },
};

/**
 * Inject current trace context into Kafka message headers.
 * Call before producing a Kafka message.
 */
export function injectTraceContext(headers: KafkaHeaders = {}): KafkaHeaders {
  propagation.inject(context.active(), headers, kafkaSetter);
  return headers;
}

/**
 * Extract trace context from Kafka message headers.
 * Returns a context with the remote span as parent.
 */
export function extractTraceContext(headers: KafkaHeaders = {}): ReturnType<typeof context.active> {
  return propagation.extract(context.active(), headers, kafkaGetter);
}

/**
 * Create a child span from Kafka consumer message headers.
 */
export function startConsumerSpan(
  tracer: ReturnType<typeof trace.getTracer>,
  spanName: string,
  headers: KafkaHeaders = {},
) {
  const parentCtx = extractTraceContext(headers);
  return tracer.startActiveSpan(
    spanName,
    { kind: SpanKind.CONSUMER },
    parentCtx,
    (span) => span,
  );
}
