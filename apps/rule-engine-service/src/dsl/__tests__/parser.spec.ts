import { parse, parseAll, ParseError } from '../parser';
import { RuleNode, ComparisonNode, LogicalNode, NotNode } from '../ast';

describe('DSL Parser', () => {
  describe('parse() — simple comparison rules', () => {
    it('should parse a simple boolean equality rule', () => {
      const rule = parse('RULE emulator_block WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0');
      expect(rule.type).toBe('rule');
      expect(rule.id).toBe('emulator_block');
      expect(rule.action).toBe('BLOCK');
      expect(rule.weight).toBe(1.0);
      expect(rule.missingPolicy).toBe('SKIP');

      const cond = rule.condition as ComparisonNode;
      expect(cond.type).toBe('comparison');
      expect(cond.field).toBe('device.isEmulator');
      expect(cond.operator).toBe('==');
      expect(cond.value).toBe(true);
    });

    it('should parse a numeric less-than comparison rule', () => {
      const rule = parse('RULE low_trust WHEN device.trustScore < 30 THEN REVIEW WEIGHT 0.8 MISSING SKIP');
      expect(rule.id).toBe('low_trust');
      expect(rule.action).toBe('REVIEW');
      expect(rule.weight).toBe(0.8);
      expect(rule.missingPolicy).toBe('SKIP');

      const cond = rule.condition as ComparisonNode;
      expect(cond.field).toBe('device.trustScore');
      expect(cond.operator).toBe('<');
      expect(cond.value).toBe(30);
    });

    it('should parse a greater-than comparison rule', () => {
      const rule = parse('RULE check WHEN velocity.txCount1h > 50 THEN REVIEW');
      const cond = rule.condition as ComparisonNode;
      expect(cond.operator).toBe('>');
      expect(cond.value).toBe(50);
    });

    it('should parse >= and <= operators', () => {
      const gte = parse('RULE r1 WHEN device.trustScore >= 50 THEN ALLOW');
      expect((gte.condition as ComparisonNode).operator).toBe('>=');

      const lte = parse('RULE r2 WHEN device.trustScore <= 50 THEN ALLOW');
      expect((lte.condition as ComparisonNode).operator).toBe('<=');
    });

    it('should parse != operator', () => {
      const rule = parse('RULE r1 WHEN device.platform != "ios" THEN REVIEW');
      const cond = rule.condition as ComparisonNode;
      expect(cond.operator).toBe('!=');
      expect(cond.value).toBe('ios');
    });

    it('should parse string value', () => {
      const rule = parse('RULE r1 WHEN device.platform == "android" THEN ALLOW');
      const cond = rule.condition as ComparisonNode;
      expect(cond.value).toBe('android');
    });

    it('should parse false boolean value', () => {
      const rule = parse('RULE r1 WHEN device.isEmulator == false THEN ALLOW');
      const cond = rule.condition as ComparisonNode;
      expect(cond.value).toBe(false);
    });

    it('should default weight to 1.0 when not specified', () => {
      const rule = parse('RULE r1 WHEN device.isEmulator == true THEN BLOCK');
      expect(rule.weight).toBe(1.0);
    });

    it('should default missingPolicy to SKIP when not specified', () => {
      const rule = parse('RULE r1 WHEN device.isEmulator == true THEN BLOCK');
      expect(rule.missingPolicy).toBe('SKIP');
    });

    it('should parse ALLOW action', () => {
      const rule = parse('RULE r1 WHEN device.trustScore > 80 THEN ALLOW');
      expect(rule.action).toBe('ALLOW');
    });
  });

  describe('parse() — AND/OR compound conditions', () => {
    it('should parse AND compound condition', () => {
      const rule = parse(
        'RULE velocity_burst WHEN velocity.burstDetected == true AND velocity.txCount1h > 50 THEN BLOCK WEIGHT 0.9',
      );
      const cond = rule.condition as LogicalNode;
      expect(cond.type).toBe('logical');
      expect(cond.op).toBe('AND');

      const left = cond.left as ComparisonNode;
      expect(left.field).toBe('velocity.burstDetected');
      expect(left.value).toBe(true);

      const right = cond.right as ComparisonNode;
      expect(right.field).toBe('velocity.txCount1h');
      expect(right.value).toBe(50);
    });

    it('should parse OR compound condition', () => {
      const rule = parse(
        'RULE or_rule WHEN device.isEmulator == true OR network.isTor == true THEN BLOCK',
      );
      const cond = rule.condition as LogicalNode;
      expect(cond.type).toBe('logical');
      expect(cond.op).toBe('OR');
    });

    it('should parse chained AND conditions (left-associative)', () => {
      const rule = parse(
        'RULE chained WHEN device.isEmulator == true AND network.isTor == true AND behavioral.isBot == true THEN BLOCK',
      );
      const outer = rule.condition as LogicalNode;
      expect(outer.type).toBe('logical');
      expect(outer.op).toBe('AND');
      // The outermost AND should have a left AND node
      const inner = outer.left as LogicalNode;
      expect(inner.type).toBe('logical');
      expect(inner.op).toBe('AND');
    });

    it('should parse OR with higher-level AND precedence with parentheses', () => {
      const rule = parse(
        'RULE grouped WHEN (device.isEmulator == true OR network.isTor == true) AND behavioral.isBot == true THEN BLOCK',
      );
      const outer = rule.condition as LogicalNode;
      expect(outer.op).toBe('AND');
      expect(outer.left.type).toBe('logical');
      expect((outer.left as LogicalNode).op).toBe('OR');
    });
  });

  describe('parse() — NOT operator', () => {
    it('should parse NOT condition', () => {
      const rule = parse('RULE r1 WHEN NOT device.isEmulator == false THEN BLOCK');
      const cond = rule.condition as NotNode;
      expect(cond.type).toBe('not');
      const inner = cond.operand as ComparisonNode;
      expect(inner.field).toBe('device.isEmulator');
    });

    it('should parse NOT with parentheses', () => {
      const rule = parse('RULE r1 WHEN NOT (device.isEmulator == true) THEN BLOCK');
      const cond = rule.condition as NotNode;
      expect(cond.type).toBe('not');
    });
  });

  describe('parse() — IN / NOT_IN operators', () => {
    it('should parse IN operator with string list', () => {
      const rule = parse('RULE r1 WHEN device.platform IN ["android", "ios"] THEN REVIEW');
      const cond = rule.condition as ComparisonNode;
      expect(cond.operator).toBe('IN');
      expect(cond.value).toEqual(['android', 'ios']);
    });

    it('should parse NOT_IN operator', () => {
      const rule = parse('RULE r1 WHEN device.platform NOT_IN ["web"] THEN ALLOW');
      const cond = rule.condition as ComparisonNode;
      expect(cond.operator).toBe('NOT_IN');
      expect(cond.value).toEqual(['web']);
    });

    it('should parse IN with numeric list', () => {
      const rule = parse('RULE r1 WHEN device.trustScore IN [10, 20, 30] THEN REVIEW');
      const cond = rule.condition as ComparisonNode;
      expect(cond.value).toEqual([10, 20, 30]);
    });
  });

  describe('parse() — WEIGHT and MISSING_POLICY', () => {
    it('should parse DEFAULT_HIGH missing policy', () => {
      const rule = parse('RULE r1 WHEN device.trustScore < 30 THEN REVIEW WEIGHT 0.5 MISSING DEFAULT_HIGH');
      expect(rule.missingPolicy).toBe('DEFAULT_HIGH');
    });

    it('should parse DEFAULT_LOW missing policy', () => {
      const rule = parse('RULE r1 WHEN device.trustScore < 30 THEN REVIEW WEIGHT 0.5 MISSING DEFAULT_LOW');
      expect(rule.missingPolicy).toBe('DEFAULT_LOW');
    });

    it('should parse floating-point weight', () => {
      const rule = parse('RULE r1 WHEN device.isEmulator == true THEN BLOCK WEIGHT 0.75');
      expect(rule.weight).toBe(0.75);
    });
  });

  describe('ParseError on bad syntax', () => {
    it('should throw ParseError when WHEN is missing', () => {
      expect(() => parse('RULE r1 device.isEmulator == true THEN BLOCK')).toThrow(ParseError);
    });

    it('should throw ParseError when THEN is missing', () => {
      expect(() => parse('RULE r1 WHEN device.isEmulator == true BLOCK')).toThrow(ParseError);
    });

    it('should throw ParseError on bad operator', () => {
      expect(() => parse('RULE r1 WHEN device.trustScore >> 50 THEN BLOCK')).toThrow(ParseError);
    });

    it('should throw ParseError on unclosed paren', () => {
      expect(() => parse('RULE r1 WHEN (device.isEmulator == true THEN BLOCK')).toThrow(ParseError);
    });

    it('should throw ParseError on missing rule identifier', () => {
      expect(() => parse('RULE WHEN device.isEmulator == true THEN BLOCK')).toThrow(ParseError);
    });

    it('should throw ParseError on field without dot notation', () => {
      expect(() => parse('RULE r1 WHEN isEmulator == true THEN BLOCK')).toThrow(ParseError);
    });

    it('should throw ParseError on invalid action', () => {
      expect(() => parse('RULE r1 WHEN device.isEmulator == true THEN DESTROY')).toThrow(ParseError);
    });

    it('should throw ParseError on invalid missing policy', () => {
      expect(() =>
        parse('RULE r1 WHEN device.isEmulator == true THEN BLOCK MISSING UNKNOWN'),
      ).toThrow(ParseError);
    });

    it('should throw ParseError on unexpected character', () => {
      expect(() => parse('RULE r1 WHEN device.trustScore @ 50 THEN BLOCK')).toThrow(ParseError);
    });

    it('should include line and column in ParseError', () => {
      try {
        parse('RULE r1 WHEN THEN BLOCK');
      } catch (e) {
        expect(e).toBeInstanceOf(ParseError);
        expect((e as ParseError).line).toBeGreaterThan(0);
      }
    });
  });

  describe('parseAll() — multiple rules', () => {
    it('should parse multiple rules from multi-line source', () => {
      const source = `
RULE emulator_block WHEN device.isEmulator == true THEN BLOCK WEIGHT 1.0
RULE low_trust WHEN device.trustScore < 30 THEN REVIEW WEIGHT 0.8 MISSING SKIP
RULE tor_exit WHEN network.isTor == true THEN BLOCK WEIGHT 1.0
      `;
      const rules = parseAll(source);
      expect(rules).toHaveLength(3);
      expect(rules[0].id).toBe('emulator_block');
      expect(rules[1].id).toBe('low_trust');
      expect(rules[2].id).toBe('tor_exit');
    });

    it('should skip blank lines between rules', () => {
      const source = `
RULE r1 WHEN device.isEmulator == true THEN BLOCK

RULE r2 WHEN network.isTor == true THEN BLOCK
      `;
      const rules = parseAll(source);
      expect(rules).toHaveLength(2);
    });

    it('should return empty array for empty source', () => {
      expect(parseAll('')).toHaveLength(0);
      expect(parseAll('   \n  \n  ')).toHaveLength(0);
    });

    it('should parse compound rules in parseAll', () => {
      const source = `RULE high_prepaid_velocity WHEN telco.prepaidProbability > 0.8 AND velocity.txCount1h > 30 THEN REVIEW WEIGHT 0.5 MISSING SKIP`;
      const rules = parseAll(source);
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('high_prepaid_velocity');
      const cond = rules[0].condition as LogicalNode;
      expect(cond.op).toBe('AND');
    });
  });
});
