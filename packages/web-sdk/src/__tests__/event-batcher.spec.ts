import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBatcher } from '../events/batcher';

const DEFAULT_OPTIONS = {
  endpoint: 'https://api.signalrisk.io',
  apiKey: 'test-api-key',
  maxBatchSize: 10,
  flushIntervalMs: 5000,
  maxRetries: 3,
};

function makeMockFetch(status = 200, body: unknown = { ok: true }) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  });
}

function makeEvent(overrides = {}) {
  return {
    type: 'test_event',
    payload: { foo: 'bar' },
    sessionId: 'sess-123',
    merchantId: 'merchant-456',
    ...overrides,
  };
}

describe('EventBatcher', () => {
  let batcher: EventBatcher;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = makeMockFetch();
    vi.stubGlobal('fetch', mockFetch);
    batcher = new EventBatcher(DEFAULT_OPTIONS);
  });

  afterEach(() => {
    batcher.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('push() adds events to the buffer', async () => {
    batcher.push(makeEvent());
    batcher.push(makeEvent({ type: 'another_event' }));

    // No fetch called yet (below maxBatchSize and not flushed)
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('flush() POSTs events with correct authorization header', async () => {
    batcher.push(makeEvent());
    await batcher.flush();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.signalrisk.io/v1/events/batch');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer test-api-key');
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('flush() sends events with timestamps', async () => {
    batcher.push(makeEvent());
    await batcher.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].timestamp).toBeTypeOf('number');
    expect(body.events[0].type).toBe('test_event');
  });

  it('buffer is cleared after a successful flush', async () => {
    batcher.push(makeEvent());
    batcher.push(makeEvent());
    await batcher.flush();

    expect(mockFetch).toHaveBeenCalledOnce();

    // Second flush should not send anything
    mockFetch.mockClear();
    await batcher.flush();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('retries on 500 server error (up to maxRetries)', async () => {
    vi.useRealTimers();
    const failFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    vi.stubGlobal('fetch', failFetch);

    const retryBatcher = new EventBatcher({ ...DEFAULT_OPTIONS, maxRetries: 3 });
    retryBatcher.push(makeEvent());
    await retryBatcher.flush();

    expect(failFetch).toHaveBeenCalledTimes(3);
  }, 10000);

  it('does NOT retry on 4xx client errors', async () => {
    vi.useRealTimers();
    const failFetch = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal('fetch', failFetch);

    const batcher400 = new EventBatcher({ ...DEFAULT_OPTIONS, maxRetries: 3 });
    batcher400.push(makeEvent());

    await expect(batcher400.flush()).rejects.toThrow('Client error: 400');
    expect(failFetch).toHaveBeenCalledTimes(1); // No retries
  });

  it('batch size limit triggers auto-flush', async () => {
    vi.useRealTimers();
    const localFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', localFetch);

    const smallBatcher = new EventBatcher({ ...DEFAULT_OPTIONS, maxBatchSize: 3 });

    smallBatcher.push(makeEvent({ type: 'e1' }));
    smallBatcher.push(makeEvent({ type: 'e2' }));
    smallBatcher.push(makeEvent({ type: 'e3' })); // Should trigger auto-flush

    // Wait for microtask queue to drain
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(localFetch).toHaveBeenCalled();
    const body = JSON.parse(localFetch.mock.calls[0][1].body);
    expect(body.events).toHaveLength(3);
  });

  it('flush() sends all buffered events in one batch', async () => {
    for (let i = 0; i < 5; i++) {
      batcher.push(makeEvent({ type: `event_${i}` }));
    }
    await batcher.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.events).toHaveLength(5);
  });

  it('start() triggers periodic flushes', async () => {
    batcher.push(makeEvent());
    batcher.start();

    await vi.advanceTimersByTimeAsync(5000);

    expect(mockFetch).toHaveBeenCalled();
  });

  it('stop() halts the periodic timer', async () => {
    batcher.push(makeEvent());
    batcher.start();
    batcher.stop();

    await vi.advanceTimersByTimeAsync(10000);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('flush() is a no-op when buffer is empty', async () => {
    await batcher.flush();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('events include deviceId when provided', async () => {
    batcher.push(makeEvent({ deviceId: 'device-789' }));
    await batcher.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.events[0].deviceId).toBe('device-789');
  });

  it('throws after exhausting all retries on persistent 500', async () => {
    vi.useRealTimers();
    const alwaysFail = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', alwaysFail);

    const failBatcher = new EventBatcher({ ...DEFAULT_OPTIONS, maxRetries: 2 });
    failBatcher.push(makeEvent());

    await expect(failBatcher.flush()).rejects.toThrow('Server error: 500');
    expect(alwaysFail).toHaveBeenCalledTimes(2);
  }, 10000);
});
