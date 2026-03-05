/**
 * SignalRisk Behavioral Service — Session Risk Scorer
 *
 * Calculates a session risk score (0-100) from behavioral signals.
 * Higher scores indicate higher risk of bot or fraudulent activity.
 *
 * Scoring rules:
 *   timingCv < 0.05   → +30 (too uniform, bot-like)
 *   timingCv > 2.0    → +15 (too random)
 *   navigationEntropy < 1.0 → +20 (linear navigation, bot-like)
 *   scrollVelocity === 0    → +15 (no scroll activity)
 *   formFillSpeed > 50      → +25 (instant form fill, bot-like)
 */

import { Injectable } from '@nestjs/common';
import { SessionAttributes } from './behavioral.types';

@Injectable()
export class SessionRiskService {
  /**
   * Calculate risk score from session behavioral attributes.
   * Returns a score in the range [0, 100].
   */
  calculateRiskScore(attrs: SessionAttributes): number {
    let score = 0;

    // Timing coefficient of variation analysis
    if (attrs.timingCv !== undefined) {
      if (attrs.timingCv < 0.05) {
        // Too uniform — bot-like mechanical timing
        score += 30;
      } else if (attrs.timingCv > 2.0) {
        // Too random — scripted random delays
        score += 15;
      }
    }

    // Navigation entropy analysis
    if (attrs.navigationEntropy !== undefined) {
      if (attrs.navigationEntropy < 1.0) {
        // Linear navigation pattern — bots navigate linearly
        score += 20;
      }
    }

    // Scroll velocity analysis
    if (attrs.scrollVelocity !== undefined) {
      if (attrs.scrollVelocity === 0) {
        // No scroll activity — bots typically don't scroll
        score += 15;
      }
    }

    // Form fill speed analysis
    if (attrs.formFillSpeed !== undefined) {
      if (attrs.formFillSpeed > 50) {
        // Instant form fill — bots fill forms programmatically
        score += 25;
      }
    }

    // Clamp to [0, 100]
    return Math.max(0, Math.min(100, score));
  }
}
