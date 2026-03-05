import { Module } from '@nestjs/common';
import { RuleRegistryService } from './rule-registry.service';

@Module({
  providers: [RuleRegistryService],
  exports: [RuleRegistryService],
})
export class RegistryModule {}
