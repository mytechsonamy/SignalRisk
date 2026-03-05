import supertest, { Test } from 'supertest';
import { generateToken, MerchantRole } from './auth.helper';

type Agent = ReturnType<typeof supertest>;

/**
 * Supertest wrapper with pre-configured auth headers.
 *
 * Provides a fluent API for making authenticated HTTP requests
 * to SignalRisk services during E2E tests.
 */

// Default base URLs for SignalRisk services
const SERVICE_URLS: Record<string, string> = {
  auth: process.env.AUTH_SERVICE_URL ?? 'http://localhost:3000',
  gateway: process.env.GATEWAY_SERVICE_URL ?? 'http://localhost:3001',
  decision: process.env.DECISION_SERVICE_URL ?? 'http://localhost:3002',
  events: process.env.EVENTS_SERVICE_URL ?? 'http://localhost:3003',
  devices: process.env.DEVICES_SERVICE_URL ?? 'http://localhost:3004',
  rules: process.env.RULES_SERVICE_URL ?? 'http://localhost:3005',
  analytics: process.env.ANALYTICS_SERVICE_URL ?? 'http://localhost:3006',
};

/**
 * Get a base Supertest agent for a specific service (no auth).
 */
export function getAgent(service: keyof typeof SERVICE_URLS): Agent {
  const baseUrl = SERVICE_URLS[service];
  if (!baseUrl) {
    throw new Error(`Unknown service: ${service}. Available: ${Object.keys(SERVICE_URLS).join(', ')}`);
  }
  return supertest(baseUrl);
}

/**
 * Authenticated request builder. Automatically attaches Bearer token.
 */
export class AuthenticatedClient {
  private readonly agent: Agent;
  private readonly token: string;

  constructor(serviceOrUrl: string, merchantId: string, role: MerchantRole = 'admin') {
    const baseUrl = SERVICE_URLS[serviceOrUrl] ?? serviceOrUrl;
    this.agent = supertest(baseUrl);
    this.token = generateToken({ merchantId, role });
  }

  get(path: string): Test {
    return this.agent.get(path).set('Authorization', `Bearer ${this.token}`);
  }

  post(path: string): Test {
    return this.agent
      .post(path)
      .set('Authorization', `Bearer ${this.token}`)
      .set('Content-Type', 'application/json');
  }

  put(path: string): Test {
    return this.agent
      .put(path)
      .set('Authorization', `Bearer ${this.token}`)
      .set('Content-Type', 'application/json');
  }

  patch(path: string): Test {
    return this.agent
      .patch(path)
      .set('Authorization', `Bearer ${this.token}`)
      .set('Content-Type', 'application/json');
  }

  delete(path: string): Test {
    return this.agent.delete(path).set('Authorization', `Bearer ${this.token}`);
  }
}

/**
 * Create an authenticated client for a service as a given merchant.
 *
 * Usage:
 *   const client = asmerchant('gateway', merchantA.id);
 *   const res = await client.get('/api/v1/events').expect(200);
 */
export function asMerchant(
  service: keyof typeof SERVICE_URLS | string,
  merchantId: string,
  role: MerchantRole = 'admin',
): AuthenticatedClient {
  return new AuthenticatedClient(service, merchantId, role);
}

/**
 * Make an unauthenticated request (for testing 401 scenarios).
 */
export function unauthenticated(service: keyof typeof SERVICE_URLS): Agent {
  return getAgent(service);
}

/**
 * Make a request with an arbitrary token (for testing invalid/expired tokens).
 */
export function withToken(service: keyof typeof SERVICE_URLS, token: string) {
  const agent = getAgent(service);
  return {
    get: (path: string) => agent.get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string) =>
      agent.post(path).set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/json'),
  };
}
