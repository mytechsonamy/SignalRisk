/**
 * SignalRisk Behavioral Service — Bot Detector
 *
 * Rule-based bot detection with weighted confidence scoring.
 * Each rule contributes a weight to the total confidence score.
 * isBot = true when confidence >= 0.5.
 *
 * Rules:
 *   Rule 1: headless browser (no WebGL/Canvas data)    → weight 0.4
 *   Rule 2: uniform timing (timingCv < 0.05)           → weight 0.3
 *   Rule 3: no mouse jitter (mouseJitter === false)     → weight 0.2
 *   Rule 4: instant form fill (formFillSpeed > 50)     → weight 0.25
 *   Rule 5: zero navigation entropy                    → weight 0.2
 *
 * Target: >85% TPR (true positive rate) on bot sessions
 */

import { SessionAttributes } from './behavioral.types';

export interface BotDetectionResult {
  isBot: boolean;
  confidence: number;  // 0-1 (may exceed 1 when multiple rules fire)
  indicators: string[];
}

export class BotDetector {
  private static readonly BOT_THRESHOLD = 0.5;

  /**
   * Detect whether the session is likely a bot.
   * Returns confidence (sum of matched rule weights) and which rules fired.
   */
  detect(attrs: SessionAttributes): BotDetectionResult {
    const indicators: string[] = [];
    let confidence = 0;

    // Rule 1: Headless browser — no WebGL or Canvas fingerprint data
    // Weight: 0.4 — strong signal as real browsers almost always have these
    if (attrs.hasWebGl === false || attrs.hasCanvas === false) {
      indicators.push('headless_browser_no_webgl_canvas');
      confidence += 0.4;
    }

    // Rule 2: Uniform timing — timingCv below human threshold
    // Weight: 0.3 — bots have mechanically uniform click timing
    if (attrs.timingCv !== undefined && attrs.timingCv < 0.05) {
      indicators.push('uniform_timing_cv');
      confidence += 0.3;
    }

    // Rule 3: No mouse jitter — mouseJitter explicitly false
    // Weight: 0.2 — real users exhibit micro mouse movements
    if (attrs.mouseJitter === false) {
      indicators.push('no_mouse_jitter');
      confidence += 0.2;
    }

    // Rule 4: Instant form fill — formFillSpeed above human limit
    // Weight: 0.25 — bots fill forms programmatically at inhuman speeds
    if (attrs.formFillSpeed !== undefined && attrs.formFillSpeed > 50) {
      indicators.push('instant_form_fill');
      confidence += 0.25;
    }

    // Rule 5: Zero navigation entropy — perfectly linear navigation
    // Weight: 0.2 — bots follow scripted linear paths with no entropy
    if (attrs.navigationEntropy !== undefined && attrs.navigationEntropy === 0) {
      indicators.push('zero_navigation_entropy');
      confidence += 0.2;
    }

    const isBot = confidence >= BotDetector.BOT_THRESHOLD;

    return {
      isBot,
      confidence,
      indicators,
    };
  }
}
