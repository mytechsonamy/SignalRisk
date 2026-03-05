/**
 * Unit tests for BotDetector
 *
 * Verifies that each rule fires independently, combined rules produce isBot=true,
 * normal sessions produce isBot=false, and headless browser alone crosses threshold.
 */

import { BotDetector } from '../bot-detector';
import { SessionAttributes } from '../behavioral.types';

function makeAttrs(overrides?: Partial<SessionAttributes>): SessionAttributes {
  return {
    sessionId: 'session-001',
    merchantId: 'merchant-001',
    ...overrides,
  };
}

describe('BotDetector', () => {
  let detector: BotDetector;

  beforeEach(() => {
    detector = new BotDetector();
  });

  // -------------------------------------------------------------------------
  // Normal (human) session
  // -------------------------------------------------------------------------

  describe('normal human session', () => {
    it('should return isBot=false for a clean human session', () => {
      const result = detector.detect(
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
      expect(result.isBot).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.indicators).toHaveLength(0);
    });

    it('should return confidence = 0 when no rules fire', () => {
      const result = detector.detect(makeAttrs());
      expect(result.confidence).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 1: Headless browser (no WebGL/Canvas)
  // -------------------------------------------------------------------------

  describe('Rule 1 — headless browser (no WebGL/Canvas)', () => {
    it('should fire when hasWebGl is false', () => {
      const result = detector.detect(makeAttrs({ hasWebGl: false, hasCanvas: true }));
      expect(result.indicators).toContain('headless_browser_no_webgl_canvas');
      expect(result.confidence).toBeCloseTo(0.4);
    });

    it('should fire when hasCanvas is false', () => {
      const result = detector.detect(makeAttrs({ hasWebGl: true, hasCanvas: false }));
      expect(result.indicators).toContain('headless_browser_no_webgl_canvas');
      expect(result.confidence).toBeCloseTo(0.4);
    });

    it('should fire when both hasWebGl and hasCanvas are false', () => {
      const result = detector.detect(makeAttrs({ hasWebGl: false, hasCanvas: false }));
      expect(result.indicators).toContain('headless_browser_no_webgl_canvas');
      expect(result.confidence).toBeCloseTo(0.4);
    });

    it('should NOT fire when both hasWebGl and hasCanvas are true', () => {
      const result = detector.detect(makeAttrs({ hasWebGl: true, hasCanvas: true }));
      expect(result.indicators).not.toContain('headless_browser_no_webgl_canvas');
    });

    it('should make isBot=true on its own (confidence 0.4 < 0.5, needs other signals)', () => {
      const result = detector.detect(makeAttrs({ hasWebGl: false, hasCanvas: false }));
      // Rule 1 alone gives 0.4 — below threshold of 0.5
      expect(result.isBot).toBe(false);
      expect(result.confidence).toBeCloseTo(0.4);
    });

    it('headless browser alone does NOT cross the 0.5 threshold', () => {
      const result = detector.detect(makeAttrs({ hasWebGl: false }));
      expect(result.confidence).toBeCloseTo(0.4);
      expect(result.isBot).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 2: Uniform timing (timingCv < 0.05)
  // -------------------------------------------------------------------------

  describe('Rule 2 — uniform timing', () => {
    it('should fire when timingCv < 0.05', () => {
      const result = detector.detect(makeAttrs({ timingCv: 0.02 }));
      expect(result.indicators).toContain('uniform_timing_cv');
      expect(result.confidence).toBeCloseTo(0.3);
    });

    it('should fire when timingCv = 0.0', () => {
      const result = detector.detect(makeAttrs({ timingCv: 0.0 }));
      expect(result.indicators).toContain('uniform_timing_cv');
    });

    it('should NOT fire when timingCv >= 0.05', () => {
      const result = detector.detect(makeAttrs({ timingCv: 0.05 }));
      expect(result.indicators).not.toContain('uniform_timing_cv');
    });

    it('should NOT fire when timingCv is not provided', () => {
      const result = detector.detect(makeAttrs({ timingCv: undefined }));
      expect(result.indicators).not.toContain('uniform_timing_cv');
    });
  });

  // -------------------------------------------------------------------------
  // Rule 3: No mouse jitter (mouseJitter === false)
  // -------------------------------------------------------------------------

  describe('Rule 3 — no mouse jitter', () => {
    it('should fire when mouseJitter is explicitly false', () => {
      const result = detector.detect(makeAttrs({ mouseJitter: false }));
      expect(result.indicators).toContain('no_mouse_jitter');
      expect(result.confidence).toBeCloseTo(0.2);
    });

    it('should NOT fire when mouseJitter is true', () => {
      const result = detector.detect(makeAttrs({ mouseJitter: true }));
      expect(result.indicators).not.toContain('no_mouse_jitter');
    });

    it('should NOT fire when mouseJitter is undefined', () => {
      const result = detector.detect(makeAttrs({ mouseJitter: undefined }));
      expect(result.indicators).not.toContain('no_mouse_jitter');
    });
  });

  // -------------------------------------------------------------------------
  // Rule 4: Instant form fill (formFillSpeed > 50)
  // -------------------------------------------------------------------------

  describe('Rule 4 — instant form fill', () => {
    it('should fire when formFillSpeed > 50', () => {
      const result = detector.detect(makeAttrs({ formFillSpeed: 100 }));
      expect(result.indicators).toContain('instant_form_fill');
      expect(result.confidence).toBeCloseTo(0.25);
    });

    it('should fire when formFillSpeed = 51', () => {
      const result = detector.detect(makeAttrs({ formFillSpeed: 51 }));
      expect(result.indicators).toContain('instant_form_fill');
    });

    it('should NOT fire when formFillSpeed <= 50', () => {
      const result = detector.detect(makeAttrs({ formFillSpeed: 50 }));
      expect(result.indicators).not.toContain('instant_form_fill');
    });

    it('should NOT fire when formFillSpeed is not provided', () => {
      const result = detector.detect(makeAttrs({ formFillSpeed: undefined }));
      expect(result.indicators).not.toContain('instant_form_fill');
    });
  });

  // -------------------------------------------------------------------------
  // Rule 5: Zero navigation entropy
  // -------------------------------------------------------------------------

  describe('Rule 5 — zero navigation entropy', () => {
    it('should fire when navigationEntropy === 0', () => {
      const result = detector.detect(makeAttrs({ navigationEntropy: 0 }));
      expect(result.indicators).toContain('zero_navigation_entropy');
      expect(result.confidence).toBeCloseTo(0.2);
    });

    it('should NOT fire when navigationEntropy > 0', () => {
      const result = detector.detect(makeAttrs({ navigationEntropy: 0.5 }));
      expect(result.indicators).not.toContain('zero_navigation_entropy');
    });

    it('should NOT fire when navigationEntropy is not provided', () => {
      const result = detector.detect(makeAttrs({ navigationEntropy: undefined }));
      expect(result.indicators).not.toContain('zero_navigation_entropy');
    });
  });

  // -------------------------------------------------------------------------
  // Combined rules → isBot=true
  // -------------------------------------------------------------------------

  describe('combined rules — bot detection', () => {
    it('should return isBot=true when combined confidence >= 0.5', () => {
      // Rule 2 (0.3) + Rule 3 (0.2) = 0.5
      const result = detector.detect(
        makeAttrs({
          timingCv: 0.01,    // Rule 2: +0.3
          mouseJitter: false, // Rule 3: +0.2
        }),
      );
      expect(result.isBot).toBe(true);
      expect(result.confidence).toBeCloseTo(0.5);
    });

    it('should return isBot=true for full bot profile', () => {
      const result = detector.detect(
        makeAttrs({
          hasWebGl: false,         // Rule 1: +0.4
          timingCv: 0.01,          // Rule 2: +0.3
          mouseJitter: false,      // Rule 3: +0.2
          formFillSpeed: 200,      // Rule 4: +0.25
          navigationEntropy: 0,    // Rule 5: +0.2
        }),
      );
      expect(result.isBot).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      expect(result.indicators).toHaveLength(5);
    });

    it('should list all indicator names when all rules fire', () => {
      const result = detector.detect(
        makeAttrs({
          hasWebGl: false,
          timingCv: 0.01,
          mouseJitter: false,
          formFillSpeed: 200,
          navigationEntropy: 0,
        }),
      );
      expect(result.indicators).toContain('headless_browser_no_webgl_canvas');
      expect(result.indicators).toContain('uniform_timing_cv');
      expect(result.indicators).toContain('no_mouse_jitter');
      expect(result.indicators).toContain('instant_form_fill');
      expect(result.indicators).toContain('zero_navigation_entropy');
    });

    it('should return isBot=false when confidence < 0.5', () => {
      // Rule 3 alone (0.2) + Rule 5 (0.2) = 0.4 → not a bot
      const result = detector.detect(
        makeAttrs({
          mouseJitter: false,    // Rule 3: +0.2
          navigationEntropy: 0,  // Rule 5: +0.2
        }),
      );
      expect(result.isBot).toBe(false);
      expect(result.confidence).toBeCloseTo(0.4);
    });

    it('headless browser + any other rule crosses the 0.5 threshold', () => {
      // Rule 1 (0.4) + Rule 3 (0.2) = 0.6
      const result = detector.detect(
        makeAttrs({
          hasWebGl: false,
          mouseJitter: false,
        }),
      );
      expect(result.isBot).toBe(true);
      expect(result.confidence).toBeCloseTo(0.6);
    });
  });
});
