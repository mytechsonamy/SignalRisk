import { Module } from '@nestjs/common';
import { DecisionController } from './decision.controller';
import { DecisionOrchestratorService } from './decision-orchestrator.service';
import { DecisionStoreService } from './decision-store.service';
import { DecisionCacheService } from './decision-cache.service';
import { SignalFetcher } from './signal-fetchers';
import { DecisionGateway, WsJwtGuard } from './decision.gateway';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { RedisModule } from '../../../../packages/redis-module/src';

@Module({
  imports: [IdempotencyModule, RedisModule.forRoot()],
  controllers: [DecisionController],
  providers: [
    DecisionOrchestratorService,
    DecisionStoreService,
    DecisionCacheService,
    SignalFetcher,
    DecisionGateway,
    WsJwtGuard,
  ],
  exports: [DecisionGateway],
})
export class DecisionModule {}
