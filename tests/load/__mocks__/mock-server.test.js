'use strict';
const http = require('http');

// Start a self-contained inline server for testing (mirrors mock-server.js logic)
let server;
let PORT;

const VALID_EVENT_TYPES = new Set(['PAGE_VIEW', 'CLICK', 'FORM_SUBMIT', 'LOGIN', 'SIGNUP', 'PAYMENT', 'CUSTOM']);

beforeAll((done) => {
  server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/v1/events') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const { events } = parsed;
          if (!events || events.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'events array is required' }));
            return;
          }
          for (const evt of events) {
            if (!evt.merchantId || !evt.deviceId || !evt.sessionId || !evt.type || evt.payload === undefined) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing required event fields' }));
              return;
            }
            if (!VALID_EVENT_TYPES.has(evt.type)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Invalid event type: ${evt.type}` }));
              return;
            }
          }
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'accepted',
            accepted: events.length,
            rejected: 0,
            results: events.map((_, i) => ({ eventId: `evt-test-${i}`, accepted: true })),
          }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/decisions') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        let parsed = {};
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }
        if (!parsed.requestId || !parsed.merchantId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required fields: requestId, merchantId' }));
          return;
        }
        const latencyMs = 87;
        setTimeout(() => {
          const reqId = req.headers['x-request-id'] || parsed.requestId || 'mock';
          res.writeHead(202, {
            'Content-Type': 'application/json',
            'X-Latency-Ms': String(latencyMs),
            'X-Request-ID': reqId,
          });
          res.end(JSON.stringify({
            requestId: reqId,
            merchantId: parsed.merchantId,
            action: 'ALLOW',
            riskScore: 20,
            riskFactors: [],
            appliedRules: [],
            latencyMs,
            cached: false,
            createdAt: new Date().toISOString(),
          }));
        }, 10);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  server.listen(0, () => {
    PORT = server.address().port;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

function makeRequest(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body != null ? JSON.stringify(body) : undefined;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers,
      ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
    };
    const req = http.request(
      { hostname: 'localhost', port: PORT, method, path, headers: reqHeaders },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          let parsedBody;
          try {
            parsedBody = JSON.parse(data);
          } catch {
            parsedBody = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsedBody });
        });
      }
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

describe('Mock Server — POST /v1/events', () => {
  it('returns 202 for a valid PAGE_VIEW event', async () => {
    const res = await makeRequest('POST', '/v1/events', {
      events: [{ merchantId: 'merchant-001', deviceId: 'device-abc', sessionId: 'sess-1', type: 'PAGE_VIEW', payload: { page: '/checkout' } }],
    });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('accepted');
    expect(res.body.accepted).toBe(1);
    expect(res.body.rejected).toBe(0);
  });

  it('returns 202 for a valid PAYMENT event', async () => {
    const res = await makeRequest('POST', '/v1/events', {
      events: [{ merchantId: 'merchant-001', deviceId: 'device-abc', sessionId: 'sess-2', type: 'PAYMENT', payload: { amount: 99.99, currency: 'USD' } }],
    });
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(1);
  });

  it('returns accepted count matching multiple events', async () => {
    const res = await makeRequest('POST', '/v1/events', {
      events: [
        { merchantId: 'merchant-001', deviceId: 'device-1', sessionId: 'sess-3', type: 'CLICK', payload: {} },
        { merchantId: 'merchant-001', deviceId: 'device-2', sessionId: 'sess-4', type: 'CLICK', payload: {} },
        { merchantId: 'merchant-002', deviceId: 'device-3', sessionId: 'sess-5', type: 'LOGIN', payload: {} },
      ],
    });
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(3);
    expect(res.body.results).toHaveLength(3);
    expect(res.body.results[0].accepted).toBe(true);
  });

  it('returns result array with eventId for each event', async () => {
    const res = await makeRequest('POST', '/v1/events', {
      events: [{ merchantId: 'm1', deviceId: 'd1', sessionId: 's1', type: 'SIGNUP', payload: {} }],
    });
    expect(res.body.results[0]).toHaveProperty('eventId');
    expect(res.body.results[0]).toHaveProperty('accepted', true);
  });

  it('returns 400 for empty events array', async () => {
    const res = await makeRequest('POST', '/v1/events', { events: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 for invalid event type', async () => {
    const res = await makeRequest('POST', '/v1/events', {
      events: [{ merchantId: 'm1', deviceId: 'd1', sessionId: 's1', type: 'page_view', payload: {} }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid event type/);
  });

  it('returns 400 when merchantId is missing', async () => {
    const res = await makeRequest('POST', '/v1/events', {
      events: [{ deviceId: 'd1', sessionId: 's1', type: 'CLICK', payload: {} }],
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await new Promise((resolve) => {
      const rawBody = 'not-valid-json!!';
      const req = http.request(
        {
          hostname: 'localhost', port: PORT, method: 'POST', path: '/v1/events',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(rawBody) },
        },
        (httpRes) => {
          let data = '';
          httpRes.on('data', c => { data += c; });
          httpRes.on('end', () => resolve({ status: httpRes.statusCode, body: JSON.parse(data) }));
        }
      );
      req.write(rawBody);
      req.end();
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid JSON/);
  });

  it('accepts all valid EventType enum values', async () => {
    const types = ['PAGE_VIEW', 'CLICK', 'FORM_SUBMIT', 'LOGIN', 'SIGNUP', 'PAYMENT', 'CUSTOM'];
    for (const type of types) {
      const res = await makeRequest('POST', '/v1/events', {
        events: [{ merchantId: 'm1', deviceId: 'd1', sessionId: 's1', type, payload: {} }],
      });
      expect(res.status).toBe(202);
    }
  });
});

describe('Mock Server — POST /v1/decisions', () => {
  it('returns 202 with a valid DecisionResult shape', async () => {
    const res = await makeRequest(
      'POST', '/v1/decisions',
      { requestId: 'req-001', merchantId: 'merchant-001', entityId: 'user-1', deviceId: 'device-1' },
      { 'X-Request-ID': 'req-001' }
    );
    expect(res.status).toBe(202);
    expect(['ALLOW', 'REVIEW', 'BLOCK']).toContain(res.body.action);
    expect(typeof res.body.riskScore).toBe('number');
    expect(res.body.riskScore).toBeGreaterThanOrEqual(0);
    expect(res.body.riskScore).toBeLessThanOrEqual(100);
    expect(typeof res.body.latencyMs).toBe('number');
    expect(res.body.cached).toBe(false);
    expect(res.body.createdAt).toBeDefined();
  });

  it('includes X-Latency-Ms response header', async () => {
    const res = await makeRequest(
      'POST', '/v1/decisions',
      { requestId: 'req-002', merchantId: 'merchant-001', entityId: 'user-2' },
      { 'X-Request-ID': 'req-002' }
    );
    expect(res.headers['x-latency-ms']).toBeDefined();
    expect(Number(res.headers['x-latency-ms'])).toBeGreaterThan(0);
  });

  it('echoes X-Request-ID header in response', async () => {
    const res = await makeRequest(
      'POST', '/v1/decisions',
      { requestId: 'req-echo-123', merchantId: 'merchant-002', entityId: 'user-3' },
      { 'X-Request-ID': 'req-echo-123' }
    );
    expect(res.headers['x-request-id']).toBe('req-echo-123');
    expect(res.body.requestId).toBe('req-echo-123');
  });

  it('returns 400 when requestId is missing', async () => {
    const res = await makeRequest('POST', '/v1/decisions', { merchantId: 'merchant-001', entityId: 'user-1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when merchantId is missing', async () => {
    const res = await makeRequest('POST', '/v1/decisions', { requestId: 'req-003', entityId: 'user-1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await new Promise((resolve) => {
      const rawBody = '{bad json}';
      const req = http.request(
        {
          hostname: 'localhost', port: PORT, method: 'POST', path: '/v1/decisions',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(rawBody) },
        },
        (httpRes) => {
          let data = '';
          httpRes.on('data', c => { data += c; });
          httpRes.on('end', () => resolve({ status: httpRes.statusCode, body: JSON.parse(data) }));
        }
      );
      req.write(rawBody);
      req.end();
    });
    expect(res.status).toBe(400);
  });

  it('includes riskFactors and appliedRules arrays in response', async () => {
    const res = await makeRequest(
      'POST', '/v1/decisions',
      { requestId: 'req-004', merchantId: 'merchant-001', entityId: 'user-4' }
    );
    expect(Array.isArray(res.body.riskFactors)).toBe(true);
    expect(Array.isArray(res.body.appliedRules)).toBe(true);
  });
});

describe('Mock Server — Unknown routes', () => {
  it('returns 404 for GET /', async () => {
    const res = await makeRequest('GET', '/', null);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });

  it('returns 404 for unknown path', async () => {
    const res = await makeRequest('GET', '/unknown/path', null);
    expect(res.status).toBe(404);
  });

  it('returns 404 for GET /v1/events (wrong method)', async () => {
    const res = await makeRequest('GET', '/v1/events', null);
    expect(res.status).toBe(404);
  });
});
