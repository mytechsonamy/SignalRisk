import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DslModule } from './dsl/dsl.module';
import { RegistryModule } from './registry/registry.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { ChargebackModule } from './chargeback/chargeback.module';
import { RulesModule } from './rules/rules.module';
import { RuleRegistryService } from './registry/rule-registry.service';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DslModule, RegistryModule, EvaluationModule, ChargebackModule, RulesModule],
  controllers: [HealthController],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  constructor(private readonly ruleRegistry: RuleRegistryService) {}

  onModuleInit(): void {
    try {
      const rulesPath = join(__dirname, 'rules', 'default.rules');
      const source = readFileSync(rulesPath, 'utf-8');
      this.ruleRegistry.load(source);
      this.logger.log(`Loaded default rules from ${rulesPath}`);
    } catch (err) {
      this.logger.warn(`Could not load default rules: ${(err as Error).message}`);
    }
  }
}
