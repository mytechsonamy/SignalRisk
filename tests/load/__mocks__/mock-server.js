#!/usr/bin/env node
/**
 * Mock server for local k6 load test development.
 * Simulates event-collector (port 3002) and decision-service (port 3009) responses.
 *
 * Event types accepted: PAGE_VIEW | CLICK | FORM_SUBMIT | LOGIN | SIGNUP | PAYMENT | CUSTOM
 * Decision outcomes: ALLOW | REVIEW | BLOCK  (field: action, not outcome)
 *
 * Run: node __mocks__/mock-server.js [port]
 */
const http = require('http');

const PORT = process.env.PORT || 3002;
let requestCount = 0;
let rateLimitCount = {};

const VALID_EVENT_TYPES = new Set(['PAGE_VIEW', 'CLICK', 'FORM_SUBMIT', 'LOGIN', 'SIGNUP', 'PAYMENT', 'CUSTOM']);

const server = http.createServer((req, res) => {
  requestCount++;

  // Parse merchant from Authorization header for rate limiting simulation
  const auth = req.headers['authorization'] || '';
  const merchantKey = auth.slice(0, 30); // first 30 chars as pseudo-merchant-id
  rateLimitCount[merchantKey] = (rateLimitCount[merchantKey] || 0) + 1;

  // Simulate backpressure after 10000 requests (1% window)
  if (requestCount % 10000 < 100) {
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': '5',
    });
    res.end(JSON.stringify({ error: 'Too Many Requests', retryAfter: 5 }));
    return;
  }

  // Route based on path
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
        // Validate required fields per CreateEventDto
        for (const evt of events) {
          if (!evt.merchantId || !evt.deviceId || !evt.sessionId || !evt.type || evt.payload === undefined) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required event fields: merchantId, deviceId, sessionId, type, payload' }));
            return;
          }
          if (!VALID_EVENT_TYPES.has(evt.type)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Invalid event type: ${evt.type}. Must be one of: ${[...VALID_EVENT_TYPES].join(', ')}` }));
            return;
          }
        }
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'accepted',
          accepted: events.length,
          rejected: 0,
          results: events.map((_, i) => ({ eventId: `evt-${requestCount}-${i}`, accepted: true })),
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

      // Simulate ~87ms average latency
      const latencyMs = 70 + Math.floor(Math.random() * 35);
      setTimeout(() => {
        const score = Math.floor(Math.random() * 100);
        const action = score > 80 ? 'BLOCK' : score > 50 ? 'REVIEW' : 'ALLOW';
        const reqId = req.headers['x-request-id'] || parsed.requestId || `mock-${requestCount}`;

        res.writeHead(202, {
          'Content-Type': 'application/json',
          'X-Latency-Ms': String(latencyMs),
          'X-Request-ID': reqId,
        });
        res.end(JSON.stringify({
          requestId: reqId,
          merchantId: parsed.merchantId,
          action,
          riskScore: score,
          riskFactors: [
            { signal: 'velocity.1m', value: score > 80 ? 15 : 2, contribution: 40, description: 'Transaction velocity in last minute' },
          ],
          appliedRules: score > 80 ? ['rule-high-velocity'] : [],
          latencyMs,
          cached: false,
          createdAt: new Date().toISOString(),
        }));
      }, latencyMs);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

// Export for testing
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`SignalRisk mock server listening on port ${PORT}`);
    console.log(`  POST /v1/events    -> 202 Accepted (event-collector)`);
    console.log(`  POST /v1/decisions -> 202 with DecisionResult (decision-service)`);
    console.log(`  Backpressure: 429 simulated at requestCount % 10000 < 100`);
  });
}

module.exports = { server, createServer: () => server };
