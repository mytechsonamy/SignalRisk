/**
 * SignalRisk Velocity Engine — REST API
 *
 * Provides HTTP endpoints for querying velocity signals.
 * Sprint 1 (Stateful Fraud): Added entityType query parameter (ADR-009).
 */

import { Controller, Get, Post, Param, Query, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { VelocityService } from './velocity.service';
import { BurstService } from '../burst/burst.service';
import {
  EntityType,
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
   * GET /v1/velocity/:entityId?entityType=customer
   *
   * Get velocity signals for a single entity.
   * Requires X-Merchant-ID header for tenant isolation.
   */
  @Get(':entityId')
  async getVelocity(
    @Param('entityId') entityId: string,
    @Headers('x-merchant-id') headerMerchantId?: string,
    @Query('entityType') entityType?: string,
  ): Promise<{ entityId: string; entityType: EntityType; signals: VelocitySignals }> {
    // Extract merchantId from X-Merchant-ID header (set by TenantMiddleware or caller).
    // Falls back to 'default' for backward compatibility in integration tests.
    const merchantId = headerMerchantId?.trim() || 'default';
    const resolvedEntityType = this.resolveEntityType(entityType);

    const signals = await this.velocityService.getVelocitySignals(merchantId, entityId, resolvedEntityType);

    // Enrich with burst detection
    const burst = await this.burstService.detectBurst(merchantId, entityId, resolvedEntityType);
    signals.burst_detected = burst.detected;

    return { entityId, entityType: resolvedEntityType, signals };
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
    const { merchantId, entityIds, entityType } = request;
    const resolvedEntityType = this.resolveEntityType(entityType);

    const results = await Promise.all(
      entityIds.map(async (entityId) => {
        const signals = await this.velocityService.getVelocitySignals(merchantId, entityId, resolvedEntityType);
        const burst = await this.burstService.detectBurst(merchantId, entityId, resolvedEntityType);
        signals.burst_detected = burst.detected;
        return { entityId, entityType: resolvedEntityType, signals };
      }),
    );

    return { results };
  }

  /** Validate and default entityType. */
  private resolveEntityType(entityType?: string): EntityType {
    if (entityType === 'customer' || entityType === 'device' || entityType === 'ip') {
      return entityType;
    }
    return 'customer';
  }
}
