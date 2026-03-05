import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const eventLatency = new Trend('event_latency');

export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 500,
      stages: [
        { target: 1000, duration: '30s' },
        { target: 5000, duration: '60s' },
        { target: 5000, duration: '60s' }, // hold at peak
        { target: 0, duration: '10s' },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    errors: ['rate<0.001'],
    http_reqs: ['rate>5000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';
const API_KEY = __ENV.API_KEY || 'sk_test_test_key_00000000000000000000000000000000';

const MERCHANTS = ['merchant-001', 'merchant-002', 'merchant-003', 'merchant-004', 'merchant-005'];
const DEVICES = Array.from({ length: 100 }, (_, i) => `device-${i.toString().padStart(6, '0')}`);
// Must match EventType enum: PAGE_VIEW | CLICK | FORM_SUBMIT | LOGIN | SIGNUP | PAYMENT | CUSTOM
const EVENT_TYPES = ['PAGE_VIEW', 'CLICK', 'FORM_SUBMIT', 'LOGIN', 'SIGNUP', 'PAYMENT'];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function () {
  const merchantId = randomFrom(MERCHANTS);
  const deviceId = randomFrom(DEVICES);
  const sessionId = `session-${__VU}-${__ITER}`;

  const payload = JSON.stringify({
    events: [
      {
        merchantId,
        deviceId,
        sessionId,
        type: randomFrom(EVENT_TYPES),
        payload: { page: '/checkout', amount: Math.random() * 100 },
        ipAddress: `10.${__VU % 256}.${__ITER % 256}.1`,
        userAgent: 'k6/load-test',
        pageUrl: 'https://shop.example.com/checkout',
      },
    ],
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    tags: { endpoint: 'ingest' },
  };

  const start = Date.now();
  const res = http.post(`${BASE_URL}/v1/events`, payload, params);
  eventLatency.add(Date.now() - start);

  const success = check(res, {
    'status is 202': (r) => r.status === 202,
    'response has accepted field': (r) => {
      try {
        return JSON.parse(r.body).accepted >= 1;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);
}
