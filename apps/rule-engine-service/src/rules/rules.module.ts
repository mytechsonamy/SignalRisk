import { Module } from '@nestjs/common';
import { RuleHotReloadService } from './rule-hot-reload.service';
import { RuleReloadController } from './rule-reload.controller';

@Module({
  controllers: [RuleReloadController],
  providers: [RuleHotReloadService],
  exports: [RuleHotReloadService],
})
export class RulesModule {}
