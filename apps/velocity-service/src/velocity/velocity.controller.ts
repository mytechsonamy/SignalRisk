/**
 * SignalRisk Velocity Engine — REST API
 *
 * Provides HTTP endpoints for querying velocity signals.
 */

import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { VelocityService } from './velocity.service';
import { BurstService } from '../burst/burst.service';
import {
  VelocitySignals,
  VelocityQueryRequest,
  VelocityQueryResult,
} from './velocity.types';

@Controller('v1/velocity')
export class VelocityController {
  constructor(
    private readonly velocityService: VelocityService,
    private readonly burstService: BurstService,
  ) {}

  /**
   * GET /v1/velocity/:entityId
   *
   * Get velocity signals for a single entity.
   * Requires X-Merchant-ID header for tenant isolation.
   */
  @Get(':entityId')
  async getVelocity(
    @Param('entityId') entityId: string,
  ): Promise<{ entityId: string; signals: VelocitySignals }> {
    // In production, merchantId comes from JWT/auth middleware.
    // For now, use a header-based approach.
    const merchantId = 'default'; // TODO: extract from auth context
    const signals = await this.velocityService.getVelocitySignals(merchantId, entityId);

    // Enrich with burst detection
    const burst = await this.burstService.detectBurst(merchantId, entityId);
    signals.burst_detected = burst.detected;

    return { entityId, signals };
  }

  /**
   * POST /v1/velocity/query
   *
   * Batch query velocity signals for multiple entities.
   */
  @Post('query')
  @HttpCode(HttpStatus.OK)
  async batchQuery(
    @Body() request: VelocityQueryRequest,
  ): Promise<{ results: VelocityQueryResult[] }> {
    const { merchantId, entityIds } = request;

    const results = await Promise.all(
      entityIds.map(async (entityId) => {
        const signals = await this.velocityService.getVelocitySignals(merchantId, entityId);
        const burst = await this.burstService.detectBurst(merchantId, entityId);
        signals.burst_detected = burst.detected;
        return { entityId, signals };
      }),
    );

    return { results };
  }
}
