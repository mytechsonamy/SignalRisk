import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaLagService } from './kafka-lag.service';

@Module({
  imports: [ConfigModule],
  providers: [KafkaLagService],
  exports: [KafkaLagService],
})
export class KafkaHealthModule {}
