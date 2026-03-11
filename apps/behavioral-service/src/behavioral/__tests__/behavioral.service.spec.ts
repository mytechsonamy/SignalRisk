/**
 * Unit tests for BehavioralService
 *
 * Integration tests: full SessionAttributes → BehavioralResult
 * Verifies orchestration of SessionRiskService and BotDetector.
 */

import { BehavioralService } from '../behavioral.service';
import { SessionRiskService } from '../session-risk.service';
import { BehavioralMlService } from '../behavioral-ml.service';
import { SessionAttributes, BehavioralResult } from '../behavioral.types';

function makeAttrs(overrides?: Partial<SessionAttributes>): SessionAttributes {
  return {
    sessionId: 'session-integration-001',
    merchantId: 'merchant-001',
    ...overrides,
  };
}

describe('BehavioralService', () => {
  let service: BehavioralService;
  let sessionRiskService: SessionRiskService;

  beforeEach(() => {
    sessionRiskService = new SessionRiskService();
    const mlService = new BehavioralMlService();
    service = new BehavioralService(sessionRiskService, mlService);
  });

  // -------------------------------------------------------------------------
  // Return type validation
  // -------------------------------------------------------------------------

  describe('return type', () => {
    it('should return a BehavioralResult with all required fields', () => {
      const result = service.analyze(makeAttrs());
      expect(result).toHaveProperty('sessionRiskScore');
      expect(result).toHaveProperty('botProbability');
      expect(result).toHaveProperty('isBot');
      expect(result).toHaveProperty('indicators');
    });

    it('should return sessionRiskScore in range [0, 100]', () => {
      const result = service.analyze(makeAttrs({ timingCv: 0.01 }));
      expect(result.sessionRiskScore).toBeGreaterThanOrEqual(0);
      expect(result.sessionRiskScore).toBeLessThanOrEqual(100);
    });

    it('should return botProbability in range [0, 1]', () => {
      const result = service.analyze(makeAttrs({ timingCv: 0.01 }));
      expect(result.botProbability).toBeGreaterThanOrEqual(0);
      expect(result.botProbability).toBeLessThanOrEqual(1);
    });

    it('should return isBot as a boolean', () => {
      const result = service.analyze(makeAttrs());
      expect(typeof result.isBot).toBe('boolean');
    });

    it('should return indicators as an array', () => {
      const result = service.analyze(makeAttrs());
      expect(Array.isArray(result.indicators)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Clean human session
  // -------------------------------------------------------------------------

  describe('clean human session', () => {
    it('should return low risk score for normal human session', () => {
      const result = service.analyze(
        makeAttrs({
          timingCv: 0.5,
          navigationEntropy: 2.0,
          scrollVelocity: 300,
          formFillSpeed: 8,
          hasWebGl: true,
          hasCanvas: true,
          mouseJitter: true,
        }),
      );
      expect(result.sessionRiskScore).toBe(0);
      expect(result.isBot).toBe(false);
      expect(result.botProbability).toBe(0);
      expect(result.indicators).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Bot session — full profile
  // -------------------------------------------------------------------------

  describe('bot session — full profile', () => {
    it('should detect a bot and return high risk for a full bot profile', () => {
      const result: BehavioralResult = service.analyze(
        makeAttrs({
          timingCv: 0.01,          // riskScore +30, bot rule +0.3
          navigationEntropy: 0,    // riskScore +20, bot rule +0.2
          scrollVelocity: 0,       // riskScore +15
          formFillSpeed: 200,      // riskScore +25, bot rule +0.25
          hasWebGl: false,         // bot rule +0.4
          mouseJitter: false,      // bot rule +0.2
        }),
      );

      // Risk score: 30 + 20 + 15 + 25 = 90
      expect(result.sessionRiskScore).toBe(90);
      expect(result.isBot).toBe(true);
      expect(result.botProbability).toBeGreaterThan(0.5);
      expect(result.indicators.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Specific signal scenarios
  // -------------------------------------------------------------------------

  describe('specific signal scenarios', () => {
    it('should compute correct riskScore for uniform timing only', () => {
      const result = service.analyze(makeAttrs({ timingCv: 0.01 }));
      expect(result.sessionRiskScore).toBe(30);
    });

    it('should compute correct riskScore for instant form fill only', () => {
      const result = service.analyze(makeAttrs({ formFillSpeed: 100 }));
      expect(result.sessionRiskScore).toBe(25);
    });

    it('should correctly combine risk signals in riskScore', () => {
      const result = service.analyze(
        makeAttrs({
          scrollVelocity: 0,   // +15
          formFillSpeed: 100,  // +25
        }),
      );
      expect(result.sessionRiskScore).toBe(40);
    });

    it('should detect bot when uniform timing + no mouse jitter fire', () => {
      // confidence = 0.3 + 0.2 = 0.5 → isBot = true
      const result = service.analyze(
        makeAttrs({
          timingCv: 0.01,
          mouseJitter: false,
        }),
      );
      expect(result.isBot).toBe(true);
      expect(result.botProbability).toBeCloseTo(0.5);
    });

    it('should return isBot=false when only one weak rule fires', () => {
      // mouseJitter alone = 0.2 → below 0.5 threshold
      const result = service.analyze(makeAttrs({ mouseJitter: false }));
      expect(result.isBot).toBe(false);
      expect(result.botProbability).toBeCloseTo(0.2);
    });

    it('should cap botProbability at 1.0 even when multiple high-weight rules fire', () => {
      const result = service.analyze(
        makeAttrs({
          hasWebGl: false,         // +0.4
          timingCv: 0.01,          // +0.3
          mouseJitter: false,      // +0.2
          formFillSpeed: 200,      // +0.25
          navigationEntropy: 0,    // +0.2
        }),
      );
      // Raw confidence = 0.4 + 0.3 + 0.2 + 0.25 + 0.2 = 1.35 → capped at 1.0
      expect(result.botProbability).toBeLessThanOrEqual(1.0);
      expect(result.botProbability).toBeCloseTo(1.0);
    });
  });

  // -------------------------------------------------------------------------
  // Minimal attributes (only required fields)
  // -------------------------------------------------------------------------

  describe('minimal session attributes', () => {
    it('should handle session with no optional signals (only sessionId and merchantId)', () => {
      const result = service.analyze({
        sessionId: 'bare-session',
        merchantId: 'bare-merchant',
      });
      expect(result.sessionRiskScore).toBe(0);
      expect(result.isBot).toBe(false);
      expect(result.botProbability).toBe(0);
      expect(result.indicators).toHaveLength(0);
    });
  });
});
