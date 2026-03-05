import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DecisionConsumerService } from './decision-consumer.service';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
  imports: [ConfigModule, WebhookModule],
  providers: [DecisionConsumerService],
  exports: [DecisionConsumerService],
})
export class KafkaModule {}
