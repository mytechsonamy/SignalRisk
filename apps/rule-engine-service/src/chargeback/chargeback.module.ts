import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChargebackConsumerService } from './chargeback-consumer.service';
import { RuleWeightAdjustmentService } from './rule-weight-adjustment.service';
import { WeightAuditService } from './weight-audit.service';

@Module({
  imports: [ConfigModule],
  providers: [
    ChargebackConsumerService,
    RuleWeightAdjustmentService,
    WeightAuditService,
  ],
  exports: [RuleWeightAdjustmentService, WeightAuditService],
})
export class ChargebackModule {}
