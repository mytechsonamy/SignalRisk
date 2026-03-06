import { test, expect } from '@playwright/test';
import { AUTH_URL, EVENT_URL, DECISION_URL, getMerchantToken, pollDecision, generateEventId } from './helpers';

test.describe('Performance Gate', () => {
  test.fixme('Decision API p99 < 500ms for single event (E2E bound)', async ({ request }) => {
    const token = await getMerchantToken(request);
    const times: number[] = [];

    for (let i = 0; i < 10; i++) {
      const eventId = generateEventId();
      const start = Date.now();
      await request.post(`${EVENT_URL}/v1/events`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Merchant-ID': 'merchant-001' },
        data: { eventId, deviceFingerprint: `perf-device-${i}`, userId: `perf-user-${i}`, amount: 100 },
      });
      await pollDecision(request, eventId, token);
      times.push(Date.now() - start);
    }

    times.sort((a, b) => a - b);
    const p99 = times[Math.floor(times.length * 0.99)] ?? times[times.length - 1];
    expect(p99).toBeLessThan(500); // E2E bound (internal p99 < 200ms + network overhead)
  });

  test.fixme('100 concurrent events complete without timeout', async ({ request }) => {
    const token = await getMerchantToken(request);
    const events = Array.from({ length: 100 }, (_, i) => ({
      eventId: generateEventId(),
      deviceFingerprint: `concurrent-device-${i}`,
      userId: `concurrent-user-${i}`,
      amount: 150,
    }));

    const start = Date.now();
    await Promise.all(
      events.map(data =>
        request.post(`${EVENT_URL}/v1/events`, {
          headers: { Authorization: `Bearer ${token}`, 'X-Merchant-ID': 'merchant-001' },
          data,
        })
      )
    );
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10_000); // 100 events < 10s toplam
  });

  test.fixme('rate limit kicks in after threshold', async ({ request }) => {
    const token = await getMerchantToken(request);
    const responses: number[] = [];

    // Hızlı burst → bazıları 429 dönmeli
    for (let i = 0; i < 200; i++) {
      const res = await request.post(`${EVENT_URL}/v1/events`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Merchant-ID': 'merchant-001' },
        data: { eventId: generateEventId(), deviceFingerprint: 'rate-test', userId: 'rate-user', amount: 10 },
      });
      responses.push(res.status());
    }

    const has429 = responses.some(s => s === 429);
    expect(has429).toBe(true);
  });
});
