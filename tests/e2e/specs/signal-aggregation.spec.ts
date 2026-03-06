import { test, expect } from '@playwright/test';

test.describe('Signal aggregation endpoints', () => {
  test('network-intel analyze returns risk signal', async ({ request }) => {
    const response = await request.post('http://localhost:3099/network-intel/analyze', {
      data: { ipAddress: '1.2.3.4', userAgent: 'Mozilla/5.0', merchantId: 'merchant-1' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('riskScore');
    expect(body).toHaveProperty('botScore');
  });

  test('telco-intel analyze returns risk signal', async ({ request }) => {
    const response = await request.post('http://localhost:3099/telco-intel/analyze', {
      data: { phoneNumber: '+1234567890', merchantId: 'merchant-1' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('riskScore');
    expect(body.isVoip).toBe(false);
  });

  test('kafka lag metrics returns prometheus format', async ({ request }) => {
    const response = await request.get('http://localhost:3099/metrics/kafka-lag');
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toContain('kafka_consumer_lag');
  });

  test('all signal endpoints available in parallel', async ({ request }) => {
    const [graphRes, networkRes, telcoRes] = await Promise.all([
      request.post('http://localhost:3099/graph-intel/analyze', { data: { accountId: 'a', merchantId: 'm' } }),
      request.post('http://localhost:3099/network-intel/analyze', { data: { ipAddress: '1.2.3.4', merchantId: 'm' } }),
      request.post('http://localhost:3099/telco-intel/analyze', { data: { merchantId: 'm' } }),
    ]);
    expect(graphRes.status()).toBe(200);
    expect(networkRes.status()).toBe(200);
    expect(telcoRes.status()).toBe(200);
  });
});
