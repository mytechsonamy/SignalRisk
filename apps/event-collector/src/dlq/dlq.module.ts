import { Module } from '@nestjs/common';
import { DlqService } from './dlq.service';
import { DlqConsumerService } from './dlq-consumer.service';

@Module({
  providers: [DlqService, DlqConsumerService],
  exports: [DlqService, DlqConsumerService],
})
export class DlqModule {}
