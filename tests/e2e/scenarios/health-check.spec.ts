/**
 * Health Check & Service Discovery E2E — Sprint 31
 *
 * Verifies all microservices are reachable and responding to health checks.
 * This is the canary test — if any service is down, this fails first.
 *
 * Run with:
 *   npx playwright test --config tests/e2e/playwright.config.real.ts health-check
 */

import { test, expect } from '@playwright/test';

const SKIP = process.env.SKIP_DOCKER === 'true';

const SERVICES = [
  { name: 'auth-service',          port: 3001 },
  { name: 'event-collector',       port: 3002 },
  { name: 'device-intel-service',  port: 3003 },
  { name: 'velocity-service',      port: 3004 },
  { name: 'behavioral-service',    port: 3005 },
  { name: 'network-intel-service', port: 3006 },
  { name: 'telco-intel-service',   port: 3007 },
  { name: 'rule-engine-service',   port: 3008 },
  { name: 'decision-service',      port: 3009 },
  { name: 'case-service',          port: 3010 },
  { name: 'webhook-service',       port: 3011 },
  { name: 'graph-intel-service',   port: 3012 },
  { name: 'feature-flag-service',  port: 3013 },
] as const;

test.describe('Health Check — All Services', () => {
  for (const svc of SERVICES) {
    test(`${svc.name} (port ${svc.port}) → /health returns 200`, async ({ request }) => {
      test.skip(SKIP, 'Requires Docker services');

      const resp = await request.get(`http://localhost:${svc.port}/health`);
      expect(resp.status()).toBe(200);

      const body = await resp.json().catch(() => null);
      if (body) {
        // Most NestJS health endpoints return { status: 'ok' } or similar
        expect(body.status ?? body.ok ?? 'ok').toBeTruthy();
      }
    });
  }

  test('all services respond within 2 seconds', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const results = await Promise.all(
      SERVICES.map(async (svc) => {
        const start = Date.now();
        try {
          const resp = await request.get(`http://localhost:${svc.port}/health`);
          return {
            name: svc.name,
            status: resp.status(),
            latencyMs: Date.now() - start,
          };
        } catch {
          return {
            name: svc.name,
            status: 0,
            latencyMs: Date.now() - start,
          };
        }
      }),
    );

    // All services should respond
    const failed = results.filter((r) => r.status !== 200);
    expect(failed).toEqual([]);

    // All should respond within 2s
    const slow = results.filter((r) => r.latencyMs > 2000);
    expect(slow).toEqual([]);
  });
});
