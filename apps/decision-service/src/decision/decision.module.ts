import { Module } from '@nestjs/common';
import { DecisionController } from './decision.controller';
import { DecisionOrchestratorService } from './decision-orchestrator.service';
import { DecisionStoreService } from './decision-store.service';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [IdempotencyModule],
  controllers: [DecisionController],
  providers: [DecisionOrchestratorService, DecisionStoreService],
})
export class DecisionModule {}
