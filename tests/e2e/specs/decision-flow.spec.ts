import { test, expect } from '@playwright/test';

test.describe('Decision flow', () => {
  test('mock server health check passes', async ({ request }) => {
    const response = await request.get('http://localhost:3099/health');
    expect(response.status()).toBe(200);
  });

  test('POST event returns event ID', async ({ request }) => {
    const response = await request.post('http://localhost:3099/v1/events', {
      data: { eventType: 'PAYMENT', merchantId: 'merchant-1', amount: 50, currency: 'USD' }
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty('eventId');
  });

  test('decisions list endpoint responds', async ({ request }) => {
    const response = await request.get('http://localhost:3099/v1/decisions');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.decisions)).toBe(true);
  });

  test('graph-intel analyze endpoint returns signal', async ({ request }) => {
    const response = await request.post('http://localhost:3099/graph-intel/analyze', {
      data: { accountId: 'acc-1', merchantId: 'merchant-1' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('riskScore');
    expect(body.fraudRingDetected).toBe(false);
  });
});
