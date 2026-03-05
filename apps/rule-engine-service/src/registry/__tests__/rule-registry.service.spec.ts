import { RuleRegistryService } from '../rule-registry.service';

describe('RuleRegistryService', () => {
  let service: RuleRegistryService;

  beforeEach(() => {
    service = new RuleRegistryService();
  });

  const SAMPLE_RULES = `
RULE emulator_block WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0
RULE low_trust WHEN device.trustScore < 30 THEN REVIEW WEIGHT 0.8 MISSING SKIP
RULE tor_exit WHEN network.isTor == true THEN BLOCK WEIGHT 1.0
  `.trim();

  it('should start with zero rules', () => {
    expect(service.count()).toBe(0);
    expect(service.getAll()).toHaveLength(0);
  });

  describe('load()', () => {
    it('should parse and store all rules', () => {
      service.load(SAMPLE_RULES);
      expect(service.count()).toBe(3);
    });

    it('should make rules accessible via getAll()', () => {
      service.load(SAMPLE_RULES);
      const all = service.getAll();
      expect(all).toHaveLength(3);
      const ids = all.map((r) => r.id);
      expect(ids).toContain('emulator_block');
      expect(ids).toContain('low_trust');
      expect(ids).toContain('tor_exit');
    });

    it('should overwrite rules with same ID on subsequent loads', () => {
      service.load('RULE my_rule WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0');
      service.load('RULE my_rule WHEN device.trustScore < 10 THEN REVIEW WEIGHT 0.5');
      expect(service.count()).toBe(1);
      const rule = service.getById('my_rule');
      expect(rule?.action).toBe('REVIEW');
    });

    it('should accumulate rules from multiple load() calls', () => {
      service.load('RULE r1 WHEN device.isEmulator == true THEN BLOCK');
      service.load('RULE r2 WHEN network.isTor == true THEN BLOCK');
      expect(service.count()).toBe(2);
    });
  });

  describe('getById()', () => {
    it('should return the correct rule by ID', () => {
      service.load(SAMPLE_RULES);
      const rule = service.getById('low_trust');
      expect(rule).toBeDefined();
      expect(rule!.id).toBe('low_trust');
      expect(rule!.action).toBe('REVIEW');
      expect(rule!.weight).toBe(0.8);
      expect(rule!.missingPolicy).toBe('SKIP');
    });

    it('should return undefined for unknown rule ID', () => {
      service.load(SAMPLE_RULES);
      expect(service.getById('nonexistent_rule')).toBeUndefined();
    });
  });

  describe('count()', () => {
    it('should return correct count after loading rules', () => {
      expect(service.count()).toBe(0);
      service.load('RULE r1 WHEN device.isEmulator == true THEN BLOCK');
      expect(service.count()).toBe(1);
      service.load('RULE r2 WHEN network.isTor == true THEN BLOCK');
      expect(service.count()).toBe(2);
    });
  });
});
