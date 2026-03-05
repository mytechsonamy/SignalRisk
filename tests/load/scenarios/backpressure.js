import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const backpressureCount = new Counter('backpressure_triggered');
const successRate = new Rate('success_rate');

export const options = {
  scenarios: {
    burst: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 1000,
      maxVUs: 2000,
      stages: [
        { target: 10000, duration: '10s' },  // Massive burst
        { target: 10000, duration: '30s' },  // Hold
        { target: 0, duration: '10s' },
      ],
    },
  },
  thresholds: {
    backpressure_triggered: ['count>0'],  // We EXPECT 429s
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';
const API_KEY = __ENV.API_KEY || 'sk_test_test_key_00000000000000000000000000000000';

export default function () {
  const res = http.post(
    `${BASE_URL}/v1/events`,
    JSON.stringify({
      events: [{
        merchantId: `merchant-${__VU % 10}`,
        deviceId: `device-burst-${__VU}`,
        sessionId: `session-${__VU}-${__ITER}`,
        type: 'CLICK',
        payload: { burst: true },
      }],
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
    },
  );

  if (res.status === 429) {
    backpressureCount.add(1);
    check(res, {
      '429 backpressure has Retry-After': (r) => r.headers['Retry-After'] !== undefined,
    });
  }

  successRate.add(res.status === 202);
}
