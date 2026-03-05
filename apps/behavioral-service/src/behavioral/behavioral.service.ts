/**
 * SignalRisk Behavioral Service — Behavioral Analysis Service
 *
 * Injectable service that orchestrates session risk scoring and bot detection.
 * Combines SessionRiskService and BotDetector to produce a unified BehavioralResult.
 */

import { Injectable, Logger } from '@nestjs/common';
import { SessionAttributes, BehavioralResult } from './behavioral.types';
import { SessionRiskService } from './session-risk.service';
import { BotDetector } from './bot-detector';

@Injectable()
export class BehavioralService {
  private readonly logger = new Logger(BehavioralService.name);
  private readonly botDetector = new BotDetector();

  constructor(private readonly sessionRiskService: SessionRiskService) {}

  /**
   * Analyze a session's behavioral attributes and return a risk assessment.
   *
   * @param attrs - Session behavioral signals collected client-side
   * @returns BehavioralResult with risk score, bot probability, isBot flag, and indicators
   */
  analyze(attrs: SessionAttributes): BehavioralResult {
    // Calculate session risk score (0-100)
    const sessionRiskScore = this.sessionRiskService.calculateRiskScore(attrs);

    // Detect bot patterns using rule-based confidence scoring
    const botResult = this.botDetector.detect(attrs);

    // Normalize confidence to [0, 1] probability — cap at 1.0
    const botProbability = Math.min(1.0, botResult.confidence);

    const result: BehavioralResult = {
      sessionRiskScore,
      botProbability,
      isBot: botResult.isBot,
      indicators: botResult.indicators,
    };

    this.logger.debug(
      `Analyzed session ${attrs.sessionId} for merchant ${attrs.merchantId}: ` +
        `riskScore=${sessionRiskScore}, botProbability=${botProbability.toFixed(3)}, ` +
        `isBot=${botResult.isBot}, indicators=[${botResult.indicators.join(', ')}]`,
    );

    return result;
  }
}
