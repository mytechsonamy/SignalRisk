import { Module } from '@nestjs/common';
import { DecisionController } from './decision.controller';
import { DecisionOrchestratorService } from './decision-orchestrator.service';
import { DecisionStoreService } from './decision-store.service';
import { DecisionCacheService } from './decision-cache.service';
import { SignalFetcher } from './signal-fetchers';
import { DecisionGateway, WsJwtGuard } from './decision.gateway';
import { DecisionProfiler } from './decision-profiler';
import { DecisionMetricsController } from './decision-metrics.controller';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { RedisModule } from '@signalrisk/redis-module';

@Module({
  imports: [IdempotencyModule, RedisModule.forRoot()],
  controllers: [DecisionController, DecisionMetricsController],
  providers: [
    DecisionOrchestratorService,
    DecisionStoreService,
    DecisionCacheService,
    SignalFetcher,
    DecisionGateway,
    WsJwtGuard,
    DecisionProfiler,
  ],
  exports: [DecisionGateway, DecisionProfiler, DecisionStoreService],
})
export class DecisionModule {}
