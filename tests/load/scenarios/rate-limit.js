import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const rateLimitedCount = new Counter('rate_limited');

export const options = {
  scenarios: {
    exceed_rate_limit: {
      executor: 'constant-arrival-rate',
      rate: 1200,     // 1200 req/min = 20/sec — exceeds 1000/min default limit
      timeUnit: '1m',
      duration: '2m',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    rate_limited: ['count>0'],  // We EXPECT some 429s
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';
const API_KEY = __ENV.API_KEY || 'sk_test_test_merchant_001_key_00000000000000';

export default function () {
  const res = http.post(
    `${BASE_URL}/v1/events`,
    JSON.stringify({
      events: [{
        merchantId: 'merchant-rate-test',
        deviceId: 'device-rate-test',
        sessionId: `session-${__VU}-${__ITER}`,
        type: 'PAGE_VIEW',
        payload: {},
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
    rateLimitedCount.add(1);
    check(res, {
      '429 has Retry-After header': (r) => r.headers['Retry-After'] !== undefined,
    });
  }
}
