import {
  buildMockCase,
  buildMockDecision,
  mockAuthToken,
  buildMockRiskFactor,
  buildHighRiskCase,
  buildResolvedCase,
} from './test-helpers';

describe('buildMockCase', () => {
  it('returns an object with all required Case fields', () => {
    const c = buildMockCase();
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
    expect(c).toHaveProperty('slaBreached');
    expect(c).toHaveProperty('assignedTo');
    expect(c).toHaveProperty('resolution');
    expect(c).toHaveProperty('resolutionNotes');
    expect(c).toHaveProperty('resolvedAt');
    expect(c).toHaveProperty('createdAt');
    expect(c).toHaveProperty('updatedAt');
  });

  it('returns default values matching expected types', () => {
    const c = buildMockCase();
    expect(typeof c.id).toBe('string');
    expect(typeof c.merchantId).toBe('string');
    expect(typeof c.riskScore).toBe('number');
    expect(Array.isArray(c.riskFactors)).toBe(true);
    expect(c.riskScore).toBeGreaterThanOrEqual(0);
    expect(c.riskScore).toBeLessThanOrEqual(100);
  });

  it('accepts overrides and applies them correctly', () => {
    const c = buildMockCase({ riskScore: 92, status: 'ESCALATED', priority: 'HIGH' });
    expect(c.riskScore).toBe(92);
    expect(c.status).toBe('ESCALATED');
    expect(c.priority).toBe('HIGH');
  });

  it('generates unique IDs for different instances', () => {
    const c1 = buildMockCase();
    const c2 = buildMockCase();
    expect(c1.id).not.toBe(c2.id);
    expect(c1.merchantId).not.toBe(c2.merchantId);
  });

  it('has valid ISO timestamp strings', () => {
    const c = buildMockCase();
    expect(() => new Date(c.createdAt)).not.toThrow();
    expect(() => new Date(c.updatedAt)).not.toThrow();
    expect(() => new Date(c.slaDeadline)).not.toThrow();
    expect(new Date(c.createdAt).getTime()).toBeGreaterThan(0);
  });

  it('has slaDeadline in the future by default', () => {
    const c = buildMockCase();
    const deadline = new Date(c.slaDeadline).getTime();
    expect(deadline).toBeGreaterThan(Date.now());
  });

  it('returns null for nullable fields by default', () => {
    const c = buildMockCase();
    expect(c.assignedTo).toBeNull();
    expect(c.resolution).toBeNull();
    expect(c.resolutionNotes).toBeNull();
    expect(c.resolvedAt).toBeNull();
  });

  it('has a valid action value', () => {
    const c = buildMockCase();
    expect(['ALLOW', 'REVIEW', 'BLOCK']).toContain(c.action);
  });

  it('has valid status and priority values', () => {
    const c = buildMockCase();
    expect(['OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED']).toContain(c.status);
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(c.priority);
  });
});

describe('buildMockDecision', () => {
  it('includes action, riskScore, and merchantId', () => {
    const d = buildMockDecision();
    expect(d).toHaveProperty('action');
    expect(d).toHaveProperty('riskScore');
    expect(d).toHaveProperty('merchantId');
  });

  it('includes all required Decision fields', () => {
    const d = buildMockDecision();
    expect(d).toHaveProperty('id');
    expect(d).toHaveProperty('entityId');
    expect(d).toHaveProperty('createdAt');
  });

  it('has a valid action value', () => {
    const d = buildMockDecision();
    expect(['ALLOW', 'REVIEW', 'BLOCK']).toContain(d.action);
  });

  it('accepts overrides correctly', () => {
    const d = buildMockDecision({ action: 'BLOCK', riskScore: 95 });
    expect(d.action).toBe('BLOCK');
    expect(d.riskScore).toBe(95);
  });

  it('generates unique IDs for different decisions', () => {
    const d1 = buildMockDecision();
    const d2 = buildMockDecision();
    expect(d1.id).not.toBe(d2.id);
  });
});

describe('mockAuthToken', () => {
  it('returns a non-empty string', () => {
    const token = mockAuthToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('returns the same token on multiple calls', () => {
    expect(mockAuthToken()).toBe(mockAuthToken());
  });
});

describe('buildMockRiskFactor', () => {
  it('returns an object with all required fields', () => {
    const rf = buildMockRiskFactor();
    expect(rf).toHaveProperty('signal');
    expect(rf).toHaveProperty('value');
    expect(rf).toHaveProperty('contribution');
    expect(rf).toHaveProperty('description');
  });

  it('has contribution in 0-1 range by default', () => {
    const rf = buildMockRiskFactor();
    expect(rf.contribution).toBeGreaterThanOrEqual(0);
    expect(rf.contribution).toBeLessThanOrEqual(1);
  });

  it('accepts overrides', () => {
    const rf = buildMockRiskFactor({ signal: 'ip_reputation', value: 'malicious', contribution: 0.9 });
    expect(rf.signal).toBe('ip_reputation');
    expect(rf.value).toBe('malicious');
    expect(rf.contribution).toBe(0.9);
  });
});

describe('buildHighRiskCase', () => {
  it('returns a BLOCK action case with HIGH priority', () => {
    const c = buildHighRiskCase();
    expect(c.action).toBe('BLOCK');
    expect(c.priority).toBe('HIGH');
    expect(c.riskScore).toBeGreaterThanOrEqual(80);
  });

  it('includes device emulator risk factor', () => {
    const c = buildHighRiskCase();
    const emulatorFactor = c.riskFactors.find((rf) => rf.signal === 'device_emulator');
    expect(emulatorFactor).toBeDefined();
    expect(emulatorFactor!.value).toBe(true);
  });
});

describe('buildResolvedCase', () => {
  it('returns a case with RESOLVED status', () => {
    const c = buildResolvedCase();
    expect(c.status).toBe('RESOLVED');
  });

  it('has non-null resolution fields', () => {
    const c = buildResolvedCase();
    expect(c.resolution).not.toBeNull();
    expect(c.resolutionNotes).not.toBeNull();
    expect(c.resolvedAt).not.toBeNull();
  });

  it('has a valid resolvedAt timestamp', () => {
    const c = buildResolvedCase();
    expect(() => new Date(c.resolvedAt!)).not.toThrow();
    expect(new Date(c.resolvedAt!).getTime()).toBeGreaterThan(0);
  });
});
