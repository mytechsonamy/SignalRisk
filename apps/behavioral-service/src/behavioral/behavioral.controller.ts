/**
 * SignalRisk Behavioral Service — Behavioral Controller
 *
 * REST endpoint for analyzing session behavioral attributes.
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BehavioralService } from './behavioral.service';
import { SessionAttributes, BehavioralResult } from './behavioral.types';

@Controller('v1/behavioral')
export class BehavioralController {
  private readonly logger = new Logger(BehavioralController.name);

  constructor(private readonly behavioralService: BehavioralService) {}

  /**
   * POST /v1/behavioral/analyze
   *
   * Accept session behavioral attributes and return a risk assessment.
   * Pure in-memory computation — no database required.
   */
  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  analyze(@Body() attrs: SessionAttributes): BehavioralResult {
    this.logger.log(
      `Analyzing session ${attrs.sessionId} for merchant ${attrs.merchantId}`,
    );

    return this.behavioralService.analyze(attrs);
  }
}
