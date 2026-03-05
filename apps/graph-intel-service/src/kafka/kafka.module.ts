import { Module } from '@nestjs/common';
import { DeviceSignalConsumerService } from './device-signal-consumer.service';
import { GraphModule } from '../graph/graph.module';

@Module({
  imports: [GraphModule],
  providers: [DeviceSignalConsumerService],
  exports: [DeviceSignalConsumerService],
})
export class KafkaModule {}
