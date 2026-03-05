import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('decision_errors');
const decisionLatency = new Trend('decision_latency_ms');

export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-vus',
      vus: 100,
      duration: '120s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    decision_errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3009';
const API_KEY = __ENV.API_KEY || 'sk_test_test_key_00000000000000000000000000000000';

export default function () {
  const requestId = `load-test-${__VU}-${__ITER}-${Date.now()}`;

  // DecisionRequest: requestId, merchantId, deviceId?, sessionId?, entityId, ip?, msisdn?, billingCountry?, amount?
  const payload = JSON.stringify({
    requestId,
    merchantId: `merchant-${(__VU % 5) + 1}`,
    deviceId: `device-${(__VU * __ITER) % 100}`,
    sessionId: `session-${__VU}-${__ITER}`,
    entityId: `user-${__VU}`,
    ip: `10.${__VU % 256}.${__ITER % 256}.1`,
    msisdn: `+9055512${String(__VU).padStart(5, '0')}`,
    billingCountry: 'TR',
    amount: Math.floor(Math.random() * 10000) / 100,
  });

  const start = Date.now();
  const res = http.post(`${BASE_URL}/v1/decisions`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      'X-Request-ID': requestId,
    },
  });
  decisionLatency.add(Date.now() - start);

  // DecisionResult: requestId, merchantId, action (ALLOW|REVIEW|BLOCK), riskScore, riskFactors, appliedRules, latencyMs, cached, createdAt
  const success = check(res, {
    'status is 202': (r) => r.status === 202,
    'has action outcome': (r) => {
      try {
        const body = JSON.parse(r.body);
        return ['ALLOW', 'REVIEW', 'BLOCK'].includes(body.action);
      } catch {
        return false;
      }
    },
    'has riskScore': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.riskScore === 'number';
      } catch {
        return false;
      }
    },
    'latency header present': (r) => r.headers['X-Latency-Ms'] !== undefined,
  });

  errorRate.add(!success);
}
