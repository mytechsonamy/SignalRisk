import { Module, forwardRef } from '@nestjs/common';
import { DecisionController } from './decision.controller';
import { DecisionOrchestratorService } from './decision-orchestrator.service';
import { DecisionStoreService } from './decision-store.service';
import { DecisionCacheService } from './decision-cache.service';
import { SignalFetcher } from './signal-fetchers';
import { DecisionGateway, WsJwtGuard } from './decision.gateway';
import { DecisionProfiler } from './decision-profiler';
import { DecisionMetricsController } from './decision-metrics.controller';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { KafkaModule } from '../kafka/kafka.module';
import { RedisModule } from '@signalrisk/redis-module';
import { FeedbackModule } from '../feedback/feedback.module';

@Module({
  imports: [IdempotencyModule, RedisModule.forRoot(), forwardRef(() => KafkaModule), FeedbackModule],
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
  exports: [DecisionOrchestratorService, DecisionGateway, DecisionProfiler, DecisionStoreService],
})
export class DecisionModule {}
