/**
 * Unit tests for SessionRiskService
 *
 * Verifies risk score calculation for various behavioral signal combinations,
 * including bot-like uniform timing, normal human timing, and boundary clamping.
 */

import { SessionRiskService } from '../session-risk.service';
import { SessionAttributes } from '../behavioral.types';

function makeAttrs(overrides?: Partial<SessionAttributes>): SessionAttributes {
  return {
    sessionId: 'session-001',
    merchantId: 'merchant-001',
    ...overrides,
  };
}

describe('SessionRiskService', () => {
  let service: SessionRiskService;

  beforeEach(() => {
    service = new SessionRiskService();
  });

  // -------------------------------------------------------------------------
  // timingCv rules
  // -------------------------------------------------------------------------

  describe('timingCv scoring', () => {
    it('should add +30 for bot-like uniform timing (timingCv < 0.05)', () => {
      const score = service.calculateRiskScore(makeAttrs({ timingCv: 0.02 }));
      expect(score).toBe(30);
    });

    it('should add +30 for timingCv exactly at 0.0 (perfect uniformity)', () => {
      const score = service.calculateRiskScore(makeAttrs({ timingCv: 0.0 }));
      expect(score).toBe(30);
    });

    it('should NOT add timingCv penalty for exactly 0.05 (boundary — normal threshold)', () => {
      const score = service.calculateRiskScore(makeAttrs({ timingCv: 0.05 }));
      expect(score).toBe(0);
    });

    it('should add +15 for too-random timing (timingCv > 2.0)', () => {
      const score = service.calculateRiskScore(makeAttrs({ timingCv: 2.5 }));
      expect(score).toBe(15);
    });

    it('should NOT add any penalty for normal human timing (timingCv 0.3-0.8)', () => {
      const score1 = service.calculateRiskScore(makeAttrs({ timingCv: 0.3 }));
      const score2 = service.calculateRiskScore(makeAttrs({ timingCv: 0.8 }));
      expect(score1).toBe(0);
      expect(score2).toBe(0);
    });

    it('should NOT add any penalty for normal timingCv = 0.5', () => {
      const score = service.calculateRiskScore(makeAttrs({ timingCv: 0.5 }));
      expect(score).toBe(0);
    });

    it('should skip timingCv rule when not provided', () => {
      const score = service.calculateRiskScore(makeAttrs({ timingCv: undefined }));
      expect(score).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // navigationEntropy rules
  // -------------------------------------------------------------------------

  describe('navigationEntropy scoring', () => {
    it('should add +20 for linear navigation (navigationEntropy < 1.0)', () => {
      const score = service.calculateRiskScore(makeAttrs({ navigationEntropy: 0.5 }));
      expect(score).toBe(20);
    });

    it('should add +20 for navigationEntropy = 0 (zero entropy)', () => {
      const score = service.calculateRiskScore(makeAttrs({ navigationEntropy: 0 }));
      expect(score).toBe(20);
    });

    it('should NOT add penalty for navigationEntropy >= 1.0', () => {
      const score = service.calculateRiskScore(makeAttrs({ navigationEntropy: 1.0 }));
      expect(score).toBe(0);
    });

    it('should NOT add penalty for high entropy (normal human)', () => {
      const score = service.calculateRiskScore(makeAttrs({ navigationEntropy: 2.5 }));
      expect(score).toBe(0);
    });

    it('should skip navigationEntropy rule when not provided', () => {
      const score = service.calculateRiskScore(makeAttrs({ navigationEntropy: undefined }));
      expect(score).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // scrollVelocity rules
  // -------------------------------------------------------------------------

  describe('scrollVelocity scoring', () => {
    it('should add +15 for zero scroll velocity', () => {
      const score = service.calculateRiskScore(makeAttrs({ scrollVelocity: 0 }));
      expect(score).toBe(15);
    });

    it('should NOT add penalty for non-zero scroll velocity', () => {
      const score = service.calculateRiskScore(makeAttrs({ scrollVelocity: 300 }));
      expect(score).toBe(0);
    });

    it('should NOT add penalty for extreme but non-zero scroll velocity', () => {
      const score = service.calculateRiskScore(makeAttrs({ scrollVelocity: 6000 }));
      expect(score).toBe(0);
    });

    it('should skip scrollVelocity rule when not provided', () => {
      const score = service.calculateRiskScore(makeAttrs({ scrollVelocity: undefined }));
      expect(score).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // formFillSpeed rules
  // -------------------------------------------------------------------------

  describe('formFillSpeed scoring', () => {
    it('should add +25 for instant form fill (formFillSpeed > 50)', () => {
      const score = service.calculateRiskScore(makeAttrs({ formFillSpeed: 100 }));
      expect(score).toBe(25);
    });

    it('should add +25 for formFillSpeed = 51 (just above threshold)', () => {
      const score = service.calculateRiskScore(makeAttrs({ formFillSpeed: 51 }));
      expect(score).toBe(25);
    });

    it('should NOT add penalty for formFillSpeed exactly at 50', () => {
      const score = service.calculateRiskScore(makeAttrs({ formFillSpeed: 50 }));
      expect(score).toBe(0);
    });

    it('should NOT add penalty for human typing speed', () => {
      const score = service.calculateRiskScore(makeAttrs({ formFillSpeed: 5 }));
      expect(score).toBe(0);
    });

    it('should skip formFillSpeed rule when not provided', () => {
      const score = service.calculateRiskScore(makeAttrs({ formFillSpeed: undefined }));
      expect(score).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Combined scenarios
  // -------------------------------------------------------------------------

  describe('combined signal scoring', () => {
    it('should return high risk for bot-like session (all signals fire)', () => {
      const score = service.calculateRiskScore(
        makeAttrs({
          timingCv: 0.01,        // +30
          navigationEntropy: 0,  // +20
          scrollVelocity: 0,     // +15
          formFillSpeed: 200,    // +25
        }),
      );
      // 30 + 20 + 15 + 25 = 90
      expect(score).toBe(90);
    });

    it('should return 0 for a normal human session (no signals fire)', () => {
      const score = service.calculateRiskScore(
        makeAttrs({
          timingCv: 0.5,
          navigationEntropy: 2.0,
          scrollVelocity: 400,
          formFillSpeed: 8,
        }),
      );
      expect(score).toBe(0);
    });

    it('should correctly combine uniform timing and instant form fill', () => {
      const score = service.calculateRiskScore(
        makeAttrs({
          timingCv: 0.02,      // +30
          formFillSpeed: 100,  // +25
        }),
      );
      expect(score).toBe(55);
    });
  });

  // -------------------------------------------------------------------------
  // Boundary clamping
  // -------------------------------------------------------------------------

  describe('score clamping', () => {
    it('should never return a score below 0', () => {
      const score = service.calculateRiskScore(makeAttrs());
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should never return a score above 100', () => {
      // All rules fire: 30 + 20 + 15 + 25 = 90 (within range, but test clamping logic)
      const score = service.calculateRiskScore(
        makeAttrs({
          timingCv: 0.01,        // +30
          navigationEntropy: 0,  // +20
          scrollVelocity: 0,     // +15
          formFillSpeed: 200,    // +25
        }),
      );
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return exactly 0 for a session with no risky signals', () => {
      const score = service.calculateRiskScore(makeAttrs());
      expect(score).toBe(0);
    });
  });
});
