/**
 * SignalRisk Event Collector — Backpressure Module
 *
 * Provides queue depth guard, per-merchant fairness, and dynamic
 * rate adjustment services, plus the unified BackpressureGuard.
 */

import { Module, Global } from '@nestjs/common';
import { BackpressureService } from './backpressure.service';
import { FairnessService } from './fairness.service';
import { RateAdjusterService } from './rate-adjuster.service';
import { BackpressureGuard } from './backpressure.guard';
import { IpRateLimitService } from './ip-rate-limit.service';

@Global()
@Module({
  providers: [
    BackpressureService,
    FairnessService,
    RateAdjusterService,
    BackpressureGuard,
    IpRateLimitService,
  ],
  exports: [
    BackpressureService,
    FairnessService,
    RateAdjusterService,
    BackpressureGuard,
    IpRateLimitService,
  ],
})
export class BackpressureModule {}
