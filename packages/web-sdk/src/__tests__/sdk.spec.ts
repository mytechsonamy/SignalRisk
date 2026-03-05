import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SignalRisk } from '../index';

const BASE_CONFIG = {
  apiKey: 'sdk-test-key',
  endpoint: 'https://api.signalrisk.io',
  merchantId: 'merchant-001',
};

function mockFetchSuccess(deviceId = 'device-returned-abc') {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ deviceId }),
  });
}

function mockCanvasAndWebGL() {
  const gl = {
    getExtension: vi.fn(() => ({
      UNMASKED_RENDERER_WEBGL: 37446,
      UNMASKED_VENDOR_WEBGL: 37445,
    })),
    getParameter: vi.fn((p: number) => (p === 37446 ? 'Test GPU' : 'Test Vendor')),
    getSupportedExtensions: vi.fn(() => ['OES_texture_float']),
    VENDOR: 0x1F00,
    RENDERER: 0x1F01,
  };

  const ctx2d = {
    textBaseline: '',
    font: '',
    fillStyle: '',
    fillRect: vi.fn(),
    fillText: vi.fn(),
  };

  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      return {
        getContext: vi.fn((type: string) => {
          if (type === 'webgl' || type === 'experimental-webgl') return gl;
          if (type === '2d') return ctx2d;
          return null;
        }),
        toDataURL: vi.fn(() => 'data:image/png;base64,sdktest'),
        width: 0,
        height: 0,
      } as unknown as HTMLCanvasElement;
    }
    return document.createElement(tag);
  });
}

/** Filter mock.calls to those where the first argument URL contains a substring */
function callsWithUrl(calls: unknown[][], urlFragment: string): unknown[][] {
  return calls.filter((args) => typeof args[0] === 'string' && args[0].includes(urlFragment));
}

describe('SignalRisk SDK', () => {
  let sdk: SignalRisk;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    mockFetch = mockFetchSuccess();
    vi.stubGlobal('fetch', mockFetch);
    mockCanvasAndWebGL();
  });

  afterEach(() => {
    sdk?.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('init() calls identify when autoIdentify is true (default)', async () => {
    sdk = new SignalRisk({ ...BASE_CONFIG, autoIdentify: true });
    await sdk.init();

    const identifyCalls = callsWithUrl(mockFetch.mock.calls, '/v1/fingerprint/identify');
    expect(identifyCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('init() does NOT call identify when autoIdentify is false', async () => {
    sdk = new SignalRisk({ ...BASE_CONFIG, autoIdentify: false });
    await sdk.init();

    const identifyCalls = callsWithUrl(mockFetch.mock.calls, '/v1/fingerprint/identify');
    expect(identifyCalls).toHaveLength(0);
  });

  it('init() stores the deviceId returned from identify', async () => {
    sdk = new SignalRisk({ ...BASE_CONFIG, autoIdentify: true });
    await sdk.init();

    expect(localStorage.getItem('sr_device_id')).toBe('device-returned-abc');
  });

  it('track() adds an event to the batcher', async () => {
    sdk = new SignalRisk({ ...BASE_CONFIG, autoIdentify: false });
    await sdk.init();
    mockFetch.mockClear();

    sdk.track('page_view', { url: '/home' });
    await sdk.flush();

    const batchCalls = callsWithUrl(mockFetch.mock.calls, '/v1/events/batch');
    expect(batchCalls).toHaveLength(1);

    const body = JSON.parse((batchCalls[0][1] as { body: string }).body);
    expect(body.events[0].type).toBe('page_view');
    expect(body.events[0].payload.url).toBe('/home');
    expect(body.events[0].merchantId).toBe('merchant-001');
    expect(body.events[0].sessionId).toBeTruthy();
  });

  it('track() includes deviceId when available', async () => {
    sdk = new SignalRisk({ ...BASE_CONFIG, autoIdentify: true });
    await sdk.init();
    mockFetch.mockClear();

    sdk.track('click', { element: 'button' });
    await sdk.flush();

    const batchCalls = callsWithUrl(mockFetch.mock.calls, '/v1/events/batch');
    const body = JSON.parse((batchCalls[0][1] as { body: string }).body);
    expect(body.events[0].deviceId).toBe('device-returned-abc');
  });

  it('track() without payload defaults to empty object', async () => {
    sdk = new SignalRisk({ ...BASE_CONFIG, autoIdentify: false });
    await sdk.init();
    mockFetch.mockClear();

    sdk.track('simple_event');
    await sdk.flush();

    const batchCalls = callsWithUrl(mockFetch.mock.calls, '/v1/events/batch');
    const body = JSON.parse((batchCalls[0][1] as { body: string }).body);
    expect(body.events[0].payload).toEqual({});
  });

  it('identify() returns deviceId from API response', async () => {
    sdk = new SignalRisk({ ...BASE_CONFIG, autoIdentify: false });
    await sdk.init();

    const deviceId = await sdk.identify();
    expect(deviceId).toBe('device-returned-abc');
  });

  it('identify() returns null on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    sdk = new SignalRisk({ ...BASE_CONFIG, autoIdentify: false });
    await sdk.init();

    const deviceId = await sdk.identify();
    expect(deviceId).toBeNull();
  });

  it('identify() returns null on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    sdk = new SignalRisk({ ...BASE_CONFIG, autoIdentify: false });
    await sdk.init();

    const deviceId = await sdk.identify();
    expect(deviceId).toBeNull();
  });

  it('destroy() stops the tracker and batcher (no more flushes)', async () => {
    sdk = new SignalRisk({ ...BASE_CONFIG, autoIdentify: false });
    await sdk.init();
    mockFetch.mockClear();

    sdk.track('before_destroy');
    sdk.destroy();

    // Advance time to what would normally trigger flush
    await vi.advanceTimersByTimeAsync(10000);

    // No automatic flush should have happened
    const batchCalls = callsWithUrl(mockFetch.mock.calls, '/v1/events/batch');
    expect(batchCalls).toHaveLength(0);
  });

  it('flush() manually sends all pending events', async () => {
    sdk = new SignalRisk({ ...BASE_CONFIG, autoIdentify: false });
    await sdk.init();
    mockFetch.mockClear();

    sdk.track('event_1');
    sdk.track('event_2');
    sdk.track('event_3');

    await sdk.flush();

    const batchCalls = callsWithUrl(mockFetch.mock.calls, '/v1/events/batch');
    expect(batchCalls).toHaveLength(1);
    const body = JSON.parse((batchCalls[0][1] as { body: string }).body);
    expect(body.events).toHaveLength(3);
  });
});
