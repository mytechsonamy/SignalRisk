import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DecisionConsumerService } from './decision-consumer.service';
import { CaseModule } from '../cases/case.module';

@Module({
  imports: [ConfigModule, CaseModule],
  providers: [DecisionConsumerService],
  exports: [DecisionConsumerService],
})
export class KafkaModule {}
