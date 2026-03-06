import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const decisionLatency = new Trend('decision_latency');
const errorRate = new Rate('errors');

export const options = {
  vus: 100,
  duration: '60s',
  thresholds: {
    'http_req_duration{name:decision}': ['p(99)<50', 'p(95)<30'],
    'errors': ['rate<0.001'],
    'http_req_failed': ['rate<0.001'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const PAYLOADS = [
  { eventType: 'PAYMENT', merchantId: 'merchant-1', amount: 99.99, currency: 'USD', deviceId: 'dev-001', ipAddress: '192.168.1.1' },
  { eventType: 'PAYMENT', merchantId: 'merchant-2', amount: 250.00, currency: 'EUR', deviceId: 'dev-002', ipAddress: '10.0.0.1' },
  { eventType: 'TOPUP', merchantId: 'merchant-1', amount: 50.00, currency: 'TRY', deviceId: 'dev-003', ipAddress: '172.16.0.5' },
];

export default function () {
  const payload = PAYLOADS[Math.floor(Math.random() * PAYLOADS.length)];
  const res = http.post(`${BASE_URL}/v1/events`, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
    tags: { name: 'decision' },
  });

  const ok = check(res, {
    'status is 200 or 201': (r) => r.status === 200 || r.status === 201,
    'response has eventId': (r) => {
      try { return JSON.parse(r.body).eventId !== undefined; } catch { return false; }
    },
  });

  decisionLatency.add(res.timings.duration);
  errorRate.add(!ok);
  sleep(0.01); // 10ms think time
}
