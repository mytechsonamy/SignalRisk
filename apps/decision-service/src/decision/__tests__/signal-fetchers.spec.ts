/**
 * Tests for SignalFetcher — real HTTP clients with AbortController timeout.
 *
 * Global fetch is mocked with jest.fn() so no real network calls are made.
 */

import { SignalFetcher } from '../signal-fetchers';

// ---------------------------------------------------------------------------
// Mock ConfigService
// ---------------------------------------------------------------------------

const mockConfig: Record<string, string> = {
  'services.deviceIntelUrl':  'http://device-intel:3003',
  'services.velocityUrl':     'http://velocity:3004',
  'services.behavioralUrl':   'http://behavioral:3005',
  'services.networkIntelUrl': 'http://network-intel:3006',
  'services.telcoIntelUrl':   'http://telco-intel:3007',
};

const mockConfigService = {
  get: jest.fn((key: string) => mockConfig[key] ?? undefined),
};

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();

beforeAll(() => {
  (global as unknown as { fetch: jest.Mock }).fetch = mockFetch;
});

afterAll(() => {
  delete (global as unknown as { fetch?: jest.Mock }).fetch;
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper to build fetch responses
// ---------------------------------------------------------------------------

function okResponse(body: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function notFoundResponse(): Response {
  return {
    ok: false,
    status: 404,
    json: () => Promise.resolve({ message: 'Not found' }),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const devicePayload = {
  deviceId:           'device-001',
  merchantId:         'merchant-001',
  fingerprint:        'fp-abc',
  trustScore:         75,
  isEmulator:         false,
  emulatorConfidence: 0.02,
  platform:           'web',
  firstSeenAt:        '2026-01-01T00:00:00.000Z',
  lastSeenAt:         '2026-03-06T00:00:00.000Z',
  daysSinceFirstSeen: 64,
};

const velocityPayload = {
  entityId:   'user-001',
  merchantId: 'merchant-001',
  dimensions: {
    txCount10m:       1,
    txCount1h:        3,
    txCount24h:       10,
    amountSum1h:      300,
    amountSum24h:     1200,
    uniqueDevices24h: 1,
    uniqueIps24h:     1,
    uniqueSessions1h: 2,
  },
  burstDetected: false,
};

const behavioralPayload = {
  sessionId:         'session-001',
  merchantId:        'merchant-001',
  sessionRiskScore:  15,
  botProbability:    0.03,
  isBot:             false,
  indicators:        [],
  timingCv:          0.42,
  navigationEntropy: 3.1,
};

const networkPayload = {
  ip:               '1.2.3.4',
  merchantId:       'merchant-001',
  country:          'TR',
  city:             'Istanbul',
  asn:              'AS9121',
  isProxy:          false,
  isVpn:            false,
  isTor:            false,
  isDatacenter:     false,
  geoMismatchScore: 0,
  riskScore:        12,
};

const telcoPayload = {
  msisdn:             '+905001234567',
  merchantId:         'merchant-001',
  operator:           'Turkcell',
  lineType:           'postpaid',
  isPorted:           false,
  prepaidProbability: 0.08,
  countryCode:        'TR',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SignalFetcher', () => {
  let fetcher: SignalFetcher;

  beforeEach(() => {
    fetcher = new SignalFetcher(mockConfigService as never);
  });

  // -------------------------------------------------------------------------
  // fetchDeviceSignal
  // -------------------------------------------------------------------------

  describe('fetchDeviceSignal', () => {
    it('successful GET → returns mapped device signal', async () => {
      mockFetch.mockResolvedValue(okResponse(devicePayload));

      const result = await fetcher.fetchDeviceSignal('device-001', 'merchant-001');

      expect(result).toEqual(devicePayload);
    });

    it('constructs correct URL with deviceId path param and merchantId query param', async () => {
      mockFetch.mockResolvedValue(okResponse(devicePayload));

      await fetcher.fetchDeviceSignal('device-001', 'merchant-001');

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'http://device-intel:3003/v1/fingerprint/devices/device-001?merchantId=merchant-001',
      );
    });

    it('passes AbortController signal to fetch', async () => {
      mockFetch.mockResolvedValue(okResponse(devicePayload));

      await fetcher.fetchDeviceSignal('device-001', 'merchant-001');

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(options?.signal).toBeDefined();
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    });

    it('404 response → returns null', async () => {
      mockFetch.mockResolvedValue(notFoundResponse());

      const result = await fetcher.fetchDeviceSignal('unknown', 'merchant-001');

      expect(result).toBeNull();
    });

    it('network error (fetch throws) → returns null', async () => {
      mockFetch.mockRejectedValue(new TypeError('Network request failed'));

      const result = await fetcher.fetchDeviceSignal('device-001', 'merchant-001');

      expect(result).toBeNull();
    });

    it('timeout (AbortController fires) → returns null', async () => {
      // fetch never resolves — AbortController fires after 150ms
      mockFetch.mockImplementation(
        (_url: string, opts: RequestInit) =>
          new Promise((_resolve, reject) => {
            if (opts?.signal) {
              opts.signal.addEventListener('abort', () =>
                reject(new DOMException('The operation was aborted.', 'AbortError')),
              );
            }
            // Never resolves on its own
          }),
      );

      const result = await fetcher.fetchDeviceSignal('device-001', 'merchant-001');

      expect(result).toBeNull();
    }, 1000);

    it('URL-encodes deviceId and merchantId', async () => {
      mockFetch.mockResolvedValue(okResponse(devicePayload));

      await fetcher.fetchDeviceSignal('dev/id+1', 'merch&ant');

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(encodeURIComponent('dev/id+1'));
      expect(url).toContain(encodeURIComponent('merch&ant'));
    });
  });

  // -------------------------------------------------------------------------
  // fetchVelocitySignal
  // -------------------------------------------------------------------------

  describe('fetchVelocitySignal', () => {
    it('successful GET → returns mapped velocity signal', async () => {
      mockFetch.mockResolvedValue(okResponse(velocityPayload));

      const result = await fetcher.fetchVelocitySignal('user-001', 'merchant-001');

      expect(result).toEqual(velocityPayload);
    });

    it('constructs correct URL with entityId path param and merchantId header', async () => {
      mockFetch.mockResolvedValue(okResponse(velocityPayload));

      await fetcher.fetchVelocitySignal('user-001', 'merchant-001');

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'http://velocity:3004/v1/velocity/user-001',
      );
      expect((options.headers as Record<string, string>)['X-Merchant-ID']).toBe('merchant-001');
    });

    it('404 response → returns null', async () => {
      mockFetch.mockResolvedValue(notFoundResponse());

      const result = await fetcher.fetchVelocitySignal('user-001', 'merchant-001');

      expect(result).toBeNull();
    });

    it('network error → returns null', async () => {
      mockFetch.mockRejectedValue(new TypeError('Network request failed'));

      const result = await fetcher.fetchVelocitySignal('user-001', 'merchant-001');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // fetchBehavioralSignal
  // -------------------------------------------------------------------------

  describe('fetchBehavioralSignal', () => {
    it('successful POST → returns mapped behavioral signal', async () => {
      mockFetch.mockResolvedValue(okResponse(behavioralPayload));

      const result = await fetcher.fetchBehavioralSignal('session-001', 'merchant-001');

      expect(result).toEqual(behavioralPayload);
    });

    it('sends POST to correct URL', async () => {
      mockFetch.mockResolvedValue(okResponse(behavioralPayload));

      await fetcher.fetchBehavioralSignal('session-001', 'merchant-001');

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://behavioral:3005/v1/behavioral/analyze');
      expect(options.method).toBe('POST');
    });

    it('POST body contains sessionId and merchantId', async () => {
      mockFetch.mockResolvedValue(okResponse(behavioralPayload));

      await fetcher.fetchBehavioralSignal('session-001', 'merchant-001');

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body).toEqual({ sessionId: 'session-001', merchantId: 'merchant-001' });
    });

    it('sets Content-Type: application/json header', async () => {
      mockFetch.mockResolvedValue(okResponse(behavioralPayload));

      await fetcher.fetchBehavioralSignal('session-001', 'merchant-001');

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>)['Content-Type']).toBe(
        'application/json',
      );
    });

    it('404 response → returns null', async () => {
      mockFetch.mockResolvedValue(notFoundResponse());

      const result = await fetcher.fetchBehavioralSignal('session-001', 'merchant-001');

      expect(result).toBeNull();
    });

    it('network error → returns null', async () => {
      mockFetch.mockRejectedValue(new TypeError('Network request failed'));

      const result = await fetcher.fetchBehavioralSignal('session-001', 'merchant-001');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // fetchNetworkSignal
  // -------------------------------------------------------------------------

  describe('fetchNetworkSignal', () => {
    it('successful POST → returns mapped network signal', async () => {
      mockFetch.mockResolvedValue(okResponse(networkPayload));

      const result = await fetcher.fetchNetworkSignal('1.2.3.4', 'merchant-001');

      expect(result).toEqual(networkPayload);
    });

    it('sends POST to correct URL', async () => {
      mockFetch.mockResolvedValue(okResponse(networkPayload));

      await fetcher.fetchNetworkSignal('1.2.3.4', 'merchant-001');

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://network-intel:3006/v1/network/analyze');
      expect(options.method).toBe('POST');
    });

    it('POST body contains ip, merchantId, and optional country params', async () => {
      mockFetch.mockResolvedValue(okResponse(networkPayload));

      await fetcher.fetchNetworkSignal('1.2.3.4', 'merchant-001', 'TR', 'TR');

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body).toEqual({
        ip:             '1.2.3.4',
        merchantId:     'merchant-001',
        msisdnCountry:  'TR',
        billingCountry: 'TR',
      });
    });

    it('POST body includes ip and merchantId when optional params absent', async () => {
      mockFetch.mockResolvedValue(okResponse(networkPayload));

      await fetcher.fetchNetworkSignal('1.2.3.4', 'merchant-001');

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body.ip).toBe('1.2.3.4');
      expect(body.merchantId).toBe('merchant-001');
    });

    it('404 response → returns null', async () => {
      mockFetch.mockResolvedValue(notFoundResponse());

      const result = await fetcher.fetchNetworkSignal('1.2.3.4', 'merchant-001');

      expect(result).toBeNull();
    });

    it('network error → returns null', async () => {
      mockFetch.mockRejectedValue(new TypeError('Network request failed'));

      const result = await fetcher.fetchNetworkSignal('1.2.3.4', 'merchant-001');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // fetchTelcoSignal
  // -------------------------------------------------------------------------

  describe('fetchTelcoSignal', () => {
    it('successful POST → returns mapped telco signal', async () => {
      mockFetch.mockResolvedValue(okResponse(telcoPayload));

      const result = await fetcher.fetchTelcoSignal('+905001234567', 'merchant-001');

      expect(result).toEqual(telcoPayload);
    });

    it('sends POST to correct URL', async () => {
      mockFetch.mockResolvedValue(okResponse(telcoPayload));

      await fetcher.fetchTelcoSignal('+905001234567', 'merchant-001');

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://telco-intel:3007/v1/telco/analyze');
      expect(options.method).toBe('POST');
    });

    it('POST body contains msisdn and merchantId', async () => {
      mockFetch.mockResolvedValue(okResponse(telcoPayload));

      await fetcher.fetchTelcoSignal('+905001234567', 'merchant-001');

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body).toEqual({ msisdn: '+905001234567', merchantId: 'merchant-001' });
    });

    it('sets Content-Type: application/json header', async () => {
      mockFetch.mockResolvedValue(okResponse(telcoPayload));

      await fetcher.fetchTelcoSignal('+905001234567', 'merchant-001');

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>)['Content-Type']).toBe(
        'application/json',
      );
    });

    it('404 response → returns null', async () => {
      mockFetch.mockResolvedValue(notFoundResponse());

      const result = await fetcher.fetchTelcoSignal('+905001234567', 'merchant-001');

      expect(result).toBeNull();
    });

    it('network error → returns null', async () => {
      mockFetch.mockRejectedValue(new TypeError('Network request failed'));

      const result = await fetcher.fetchTelcoSignal('+905001234567', 'merchant-001');

      expect(result).toBeNull();
    });

    it('timeout (AbortController fires) → returns null', async () => {
      mockFetch.mockImplementation(
        (_url: string, opts: RequestInit) =>
          new Promise((_resolve, reject) => {
            if (opts?.signal) {
              opts.signal.addEventListener('abort', () =>
                reject(new DOMException('The operation was aborted.', 'AbortError')),
              );
            }
            // Never resolves on its own
          }),
      );

      const result = await fetcher.fetchTelcoSignal('+905001234567', 'merchant-001');

      expect(result).toBeNull();
    }, 1000);
  });

  // -------------------------------------------------------------------------
  // Config fallback (default localhost URLs)
  // -------------------------------------------------------------------------

  describe('config fallback to localhost defaults', () => {
    it('uses localhost:3003 default when DEVICE_INTEL_URL config is absent', async () => {
      const fetcherNoConfig = new SignalFetcher({
        get: jest.fn(() => undefined),
      } as never);

      mockFetch.mockResolvedValue(okResponse(devicePayload));

      await fetcherNoConfig.fetchDeviceSignal('device-001', 'merchant-001');

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('http://localhost:3003');
    });

    it('uses localhost:3004 default when VELOCITY_URL config is absent', async () => {
      const fetcherNoConfig = new SignalFetcher({
        get: jest.fn(() => undefined),
      } as never);

      mockFetch.mockResolvedValue(okResponse(velocityPayload));

      await fetcherNoConfig.fetchVelocitySignal('user-001', 'merchant-001');

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('http://localhost:3004');
    });
  });
});
