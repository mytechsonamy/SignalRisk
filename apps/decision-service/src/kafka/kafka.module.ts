import { Module } from '@nestjs/common';
import { DecisionModule } from '../decision/decision.module';
import { EventsConsumerService } from './events-consumer.service';
import { DecisionsProducerService } from './decisions-producer.service';

@Module({
  imports: [DecisionModule],
  providers: [EventsConsumerService, DecisionsProducerService],
  exports: [DecisionsProducerService],
})
export class KafkaModule {}
