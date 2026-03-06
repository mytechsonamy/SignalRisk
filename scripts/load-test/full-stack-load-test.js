import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const decisionsPerSecond = new Counter('decisions_total');
const blockRate = new Rate('block_rate');
const allowRate = new Rate('allow_rate');
const decisionLatency = new Trend('decision_latency_ms');

export const options = {
  scenarios: {
    // Ramp up to 5000 req/sec over 1 min, sustain 3 min, ramp down 1 min
    ramp_up: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 500,
      stages: [
        { duration: '1m', target: 5000 },   // ramp up
        { duration: '3m', target: 5000 },   // sustain
        { duration: '1m', target: 0 },      // ramp down
      ],
    },
  },
  thresholds: {
    'http_req_duration{scenario:ramp_up}': ['p(99)<100', 'p(95)<50'],
    'http_req_failed': ['rate<0.005'],
    'decisions_total': ['count>270000'],   // 4500/sec * 60s sustained = 270K minimum
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test scenarios weighted by realistic fraud distribution
const SCENARIOS = [
  // 70% normal payments
  ...Array(7).fill({ type: 'normal' }),
  // 20% high-risk
  ...Array(2).fill({ type: 'high-risk' }),
  // 10% edge cases
  { type: 'edge' },
];

function buildPayload(scenarioType) {
  const base = {
    merchantId: `merchant-${Math.floor(Math.random() * 100) + 1}`,
    currency: ['USD', 'EUR', 'TRY', 'GBP'][Math.floor(Math.random() * 4)],
    timestamp: new Date().toISOString(),
  };

  switch (scenarioType) {
    case 'normal':
      return {
        ...base,
        eventType: 'PAYMENT',
        amount: Math.random() * 200 + 10,
        deviceId: `dev-${Math.floor(Math.random() * 10000)}`,
        ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      };
    case 'high-risk':
      return {
        ...base,
        eventType: 'PAYMENT',
        amount: Math.random() * 5000 + 1000,  // high amount
        deviceId: `dev-flagged-${Math.floor(Math.random() * 10)}`,  // few devices
        ipAddress: `185.220.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,  // Tor-like
        phoneNumber: `+9055${Math.floor(Math.random() * 9000000) + 1000000}`,
      };
    case 'edge':
      return {
        ...base,
        eventType: 'TOPUP',
        amount: 0.01,
        deviceId: null,
        ipAddress: null,
      };
  }
}

export default function () {
  const scenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
  const payload = buildPayload(scenario.type);

  const res = http.post(
    `${BASE_URL}/v1/events`,
    JSON.stringify(payload),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': `test-key-${payload.merchantId}`,
      },
    }
  );

  const ok = check(res, {
    'status 200 or 201': (r) => r.status === 200 || r.status === 201,
    'response time < 100ms': (r) => r.timings.duration < 100,
    'has eventId': (r) => {
      try { return !!JSON.parse(r.body).eventId; } catch { return false; }
    },
  });

  decisionsPerSecond.add(1);
  decisionLatency.add(res.timings.duration);

  if (ok) {
    try {
      const body = JSON.parse(res.body);
      if (body.decision === 'BLOCK') blockRate.add(1);
      else allowRate.add(1);
    } catch (_) {}
  }
}

export function handleSummary(data) {
  return {
    'scripts/load-test/results/summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, opts) {
  const p99 = data.metrics.http_req_duration?.values?.['p(99)'] ?? 'N/A';
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'] ?? 'N/A';
  const rps = data.metrics.decisions_total?.values?.count / data.state.testRunDurationMs * 1000 ?? 0;
  return `
=== SignalRisk Load Test Summary ===
Throughput:  ${rps.toFixed(0)} req/sec
p95 latency: ${typeof p95 === 'number' ? p95.toFixed(1) : p95}ms
p99 latency: ${typeof p99 === 'number' ? p99.toFixed(1) : p99}ms
Error rate:  ${((data.metrics.http_req_failed?.values?.rate ?? 0) * 100).toFixed(3)}%
SLA target:  p99 < 100ms | p95 < 50ms | errors < 0.5%
`;
}
