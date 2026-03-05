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

@Global()
@Module({
  providers: [
    BackpressureService,
    FairnessService,
    RateAdjusterService,
    BackpressureGuard,
  ],
  exports: [
    BackpressureService,
    FairnessService,
    RateAdjusterService,
    BackpressureGuard,
  ],
})
export class BackpressureModule {}
