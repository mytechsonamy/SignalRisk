import { Module } from '@nestjs/common';
import { RuleEvaluationService } from './rule-evaluation.service';
import { RuleEvaluationController } from './rule-evaluation.controller';
import { RegistryModule } from '../registry/registry.module';

@Module({
  imports: [RegistryModule],
  controllers: [RuleEvaluationController],
  providers: [RuleEvaluationService],
  exports: [RuleEvaluationService],
})
export class EvaluationModule {}
