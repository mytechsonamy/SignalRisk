/**
 * SignalRisk Decision Service — Decision Controller
 *
 * POST /v1/decisions
 *   - Checks idempotency cache first
 *   - Orchestrates signal enrichment and scoring
 *   - Persists result asynchronously
 *   - Returns 202 Accepted with decision payload
 *   - Echoes X-Request-ID and adds X-Latency-Ms response headers
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  Res,
  Logger,
  Headers,
} from '@nestjs/common';
import { Response } from 'express';
import { DecisionOrchestratorService } from './decision-orchestrator.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { DecisionStoreService } from './decision-store.service';
import { DecisionRequest, DecisionResult } from './decision.types';

@Controller()
export class DecisionController {
  private readonly logger = new Logger(DecisionController.name);

  constructor(
    private readonly orchestrator: DecisionOrchestratorService,
    private readonly idempotency: IdempotencyService,
    private readonly store: DecisionStoreService,
  ) {}

  @Post('/v1/decisions')
  @HttpCode(202)
  async decide(
    @Body() req: DecisionRequest,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-request-id') xRequestId?: string,
  ): Promise<DecisionResult> {
    const startedAt = Date.now();

    // Echo X-Request-ID if provided; otherwise use requestId from body
    res.setHeader('X-Request-ID', xRequestId || req.requestId);

    // Check idempotency cache
    const cached = await this.idempotency.get(req.requestId, req.merchantId);
    if (cached) {
      const latencyMs = Date.now() - startedAt;
      res.setHeader('X-Latency-Ms', String(latencyMs));
      this.logger.debug(`Idempotency hit for requestId=${req.requestId}`);
      return cached;
    }

    // Orchestrate decision
    const result = await this.orchestrator.decide(req);

    // Set latency header
    res.setHeader('X-Latency-Ms', String(result.latencyMs));

    // Persist to cache and DB (fire-and-forget for DB; cache is awaited for correctness)
    await this.idempotency.set(result);
    this.store.save(result).catch((err: Error) => {
      this.logger.error(`Async store failed for ${result.requestId}: ${err.message}`);
    });

    return result;
  }
}
