import { Module } from '@nestjs/common';
import { RuleRegistryService } from './rule-registry.service';
import { AdminRulesController } from './admin-rules.controller';

@Module({
  controllers: [AdminRulesController],
  providers: [RuleRegistryService],
  exports: [RuleRegistryService],
})
export class RegistryModule {}
