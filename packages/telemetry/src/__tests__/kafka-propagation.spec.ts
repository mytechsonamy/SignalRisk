/**
 * Tests for Kafka trace context propagation helpers.
 */

// Mock @opentelemetry/api before imports so the module picks up the mock
jest.mock('@opentelemetry/api', () => ({
  propagation: {
    inject: jest.fn((ctx, carrier, setter) => {
      setter.set(carrier, 'traceparent', '00-trace-id-span-id-01');
    }),
    extract: jest.fn((ctx, _carrier, _getter) => ctx),
  },
  context: {
    active: jest.fn(() => ({})),
  },
  trace: {
    getTracer: jest.fn(() => ({
      startActiveSpan: jest.fn((_name, _opts, _ctx, fn) => fn({ end: jest.fn() })),
    })),
  },
  SpanKind: { CONSUMER: 3 },
  TextMapSetter: {},
  TextMapGetter: {},
}));

import { propagation, context, trace } from '@opentelemetry/api';
import {
  injectTraceContext,
  extractTraceContext,
  startConsumerSpan,
} from '../kafka-propagation';

describe('kafka-propagation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-configure inject mock after clear
    (propagation.inject as jest.Mock).mockImplementation((ctx, carrier, setter) => {
      setter.set(carrier, 'traceparent', '00-trace-id-span-id-01');
    });
    (propagation.extract as jest.Mock).mockImplementation((ctx) => ctx);
    (context.active as jest.Mock).mockReturnValue({});
  });

  // -------------------------------------------------------------------------
  // injectTraceContext
  // -------------------------------------------------------------------------

  describe('injectTraceContext', () => {
    it('calls propagation.inject with the active context and provided headers', () => {
      const headers = { 'x-custom': 'value' };
      injectTraceContext(headers);

      expect(propagation.inject).toHaveBeenCalledTimes(1);
      // First arg is the active context
      expect(context.active).toHaveBeenCalled();
    });

    it('returns the headers object with traceparent injected', () => {
      const headers: Record<string, string> = {};
      const result = injectTraceContext(headers);

      expect(result).toBe(headers); // same reference
      expect(result['traceparent']).toBe('00-trace-id-span-id-01');
    });

    it('works with pre-populated headers (merges, does not replace)', () => {
      const headers = { 'content-type': 'application/json' };
      const result = injectTraceContext(headers);

      expect(result['content-type']).toBe('application/json');
      expect(result['traceparent']).toBe('00-trace-id-span-id-01');
    });

    it('works with no argument — creates a new headers object', () => {
      const result = injectTraceContext();

      expect(typeof result).toBe('object');
      expect(result['traceparent']).toBe('00-trace-id-span-id-01');
    });

    it('works with an empty headers object explicitly passed', () => {
      const result = injectTraceContext({});

      expect(result['traceparent']).toBe('00-trace-id-span-id-01');
    });
  });

  // -------------------------------------------------------------------------
  // extractTraceContext
  // -------------------------------------------------------------------------

  describe('extractTraceContext', () => {
    it('calls propagation.extract with the active context and provided headers', () => {
      const headers = { traceparent: '00-trace-id-span-id-01' };
      extractTraceContext(headers);

      expect(propagation.extract).toHaveBeenCalledTimes(1);
      expect(context.active).toHaveBeenCalled();
    });

    it('returns a context object', () => {
      const result = extractTraceContext({ traceparent: '00-trace-id-span-id-01' });

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('works with empty headers', () => {
      const result = extractTraceContext({});

      expect(result).toBeDefined();
    });

    it('works with no argument', () => {
      const result = extractTraceContext();

      expect(propagation.extract).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('passes the carrier headers to the extract call', () => {
      const headers = { traceparent: '00-abc-def-01', tracestate: 'vendor=value' };
      extractTraceContext(headers);

      const extractCall = (propagation.extract as jest.Mock).mock.calls[0];
      // Second argument is the carrier
      expect(extractCall[1]).toBe(headers);
    });
  });

  // -------------------------------------------------------------------------
  // startConsumerSpan
  // -------------------------------------------------------------------------

  describe('startConsumerSpan', () => {
    it('calls tracer.startActiveSpan with the provided span name', () => {
      const mockTracer = trace.getTracer('test');
      startConsumerSpan(mockTracer, 'test.consume', {});

      expect((mockTracer.startActiveSpan as jest.Mock)).toHaveBeenCalledWith(
        'test.consume',
        expect.objectContaining({ kind: 3 }), // SpanKind.CONSUMER = 3
        expect.anything(),
        expect.any(Function),
      );
    });

    it('extracts trace context from headers before starting the span', () => {
      const mockTracer = trace.getTracer('test');
      const headers = { traceparent: '00-trace-id-span-id-01' };

      startConsumerSpan(mockTracer, 'consumer.span', headers);

      expect(propagation.extract).toHaveBeenCalledTimes(1);
      const extractCall = (propagation.extract as jest.Mock).mock.calls[0];
      expect(extractCall[1]).toBe(headers);
    });

    it('returns the span returned by startActiveSpan callback', () => {
      const mockEnd = jest.fn();
      const mockSpan = { end: mockEnd };
      const mockTracer = {
        startActiveSpan: jest.fn((_name, _opts, _ctx, fn) => fn(mockSpan)),
      } as any;

      const result = startConsumerSpan(mockTracer, 'my.span', {});

      expect(result).toBe(mockSpan);
    });

    it('works with empty headers', () => {
      const mockTracer = trace.getTracer('test');

      expect(() => startConsumerSpan(mockTracer, 'my.span', {})).not.toThrow();
    });
  });
});
