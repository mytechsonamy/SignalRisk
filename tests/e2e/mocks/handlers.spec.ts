// Jest-safe: imports from mock-data.ts which has no MSW/ESM dependency
import { mockCases, mockDecisions, handlerRoutes } from './mock-data';

describe('MSW Handler Routes Registry', () => {
  it('should define handlers for all required routes', () => {
    expect(handlerRoutes.length).toBeGreaterThanOrEqual(12);
  });

  it('should include auth routes', () => {
    const paths = handlerRoutes.map((h) => h.path);
    expect(paths).toContain('/v1/auth/login');
    expect(paths).toContain('/v1/auth/logout');
  });

  it('should include auth refresh route', () => {
    const paths = handlerRoutes.map((h) => h.path);
    expect(paths).toContain('/v1/auth/refresh');
  });

  it('should include case routes', () => {
    const paths = handlerRoutes.map((h) => h.path);
    expect(paths).toContain('/v1/cases');
    expect(paths).toContain('/v1/cases/:id');
    expect(paths).toContain('/v1/cases/bulk');
  });

  it('should include analytics routes', () => {
    const paths = handlerRoutes.map((h) => h.path);
    expect(paths).toContain('/v1/analytics/risk-scores');
    expect(paths).toContain('/v1/analytics/decisions');
    expect(paths).toContain('/v1/analytics/trends');
  });

  it('should include chargebacks route', () => {
    const paths = handlerRoutes.map((h) => h.path);
    expect(paths).toContain('/v1/chargebacks');
  });

  it('should include feature flags route', () => {
    const paths = handlerRoutes.map((h) => h.path);
    expect(paths).toContain('/v1/flags/:name/check');
  });

  it('should include health route', () => {
    const paths = handlerRoutes.map((h) => h.path);
    expect(paths).toContain('/health');
  });

  it('should have correct HTTP methods for auth routes', () => {
    const login = handlerRoutes.find((h) => h.path === '/v1/auth/login');
    const logout = handlerRoutes.find((h) => h.path === '/v1/auth/logout');
    expect(login?.method).toBe('POST');
    expect(logout?.method).toBe('POST');
  });

  it('should have correct HTTP method for cases GET route', () => {
    const casesGet = handlerRoutes.find((h) => h.path === '/v1/cases' && h.method === 'GET');
    expect(casesGet).toBeDefined();
  });

  it('should have correct HTTP method for cases PATCH route', () => {
    const casesPatch = handlerRoutes.find((h) => h.path === '/v1/cases/:id' && h.method === 'PATCH');
    expect(casesPatch).toBeDefined();
  });

  it('should have handler route entries as objects with method and path', () => {
    for (const route of handlerRoutes) {
      expect(route).toHaveProperty('method');
      expect(route).toHaveProperty('path');
      expect(typeof route.method).toBe('string');
      expect(typeof route.path).toBe('string');
      expect(route.path.startsWith('/')).toBe(true);
    }
  });
});

describe('Mock Case Data', () => {
  it('should return valid mock case data with 2 cases', () => {
    expect(mockCases).toHaveLength(2);
  });

  it('should have case-001 as BLOCK HIGH priority', () => {
    const c1 = mockCases[0];
    expect(c1.id).toBe('case-001');
    expect(c1.merchantId).toBe('merchant-abc');
    expect(c1.action).toBe('BLOCK');
    expect(c1.riskScore).toBe(87);
    expect(c1.status).toBe('OPEN');
    expect(c1.priority).toBe('HIGH');
  });

  it('should have case-002 as REVIEW MEDIUM priority', () => {
    const c2 = mockCases[1];
    expect(c2.id).toBe('case-002');
    expect(c2.action).toBe('REVIEW');
    expect(c2.status).toBe('IN_REVIEW');
    expect(c2.priority).toBe('MEDIUM');
  });

  it('should have mock cases with all required Case interface fields', () => {
    for (const c of mockCases) {
      expect(c).toHaveProperty('id');
      expect(c).toHaveProperty('merchantId');
      expect(c).toHaveProperty('decisionId');
      expect(c).toHaveProperty('entityId');
      expect(c).toHaveProperty('action');
      expect(c).toHaveProperty('riskScore');
      expect(c).toHaveProperty('riskFactors');
      expect(c).toHaveProperty('status');
      expect(c).toHaveProperty('priority');
      expect(c).toHaveProperty('slaDeadline');
      expect(c).toHaveProperty('assignedTo');
      expect(c).toHaveProperty('resolution');
      expect(c).toHaveProperty('createdAt');
      expect(c).toHaveProperty('updatedAt');
    }
  });

  it('should have risk factors with required fields', () => {
    for (const c of mockCases) {
      for (const rf of c.riskFactors) {
        expect(rf).toHaveProperty('signal');
        expect(rf).toHaveProperty('value');
        expect(rf).toHaveProperty('contribution');
        expect(rf).toHaveProperty('description');
        expect(typeof rf.contribution).toBe('number');
        expect(rf.contribution).toBeGreaterThanOrEqual(0);
        expect(rf.contribution).toBeLessThanOrEqual(1);
      }
    }
  });

  it('should have valid risk scores in 0-100 range', () => {
    for (const c of mockCases) {
      expect(c.riskScore).toBeGreaterThanOrEqual(0);
      expect(c.riskScore).toBeLessThanOrEqual(100);
    }
  });

  it('should have ISO datetime strings in case timestamps', () => {
    const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    for (const c of mockCases) {
      expect(c.createdAt).toMatch(isoPattern);
      expect(c.updatedAt).toMatch(isoPattern);
      expect(c.slaDeadline).toMatch(isoPattern);
    }
  });

  it('should have valid mock decisions with required fields', () => {
    expect(mockDecisions).toHaveLength(2);
    for (const d of mockDecisions) {
      expect(d).toHaveProperty('id');
      expect(d).toHaveProperty('merchantId');
      expect(d).toHaveProperty('entityId');
      expect(d).toHaveProperty('action');
      expect(d).toHaveProperty('riskScore');
      expect(d).toHaveProperty('createdAt');
      expect(['ALLOW', 'REVIEW', 'BLOCK']).toContain(d.action);
    }
  });
});
