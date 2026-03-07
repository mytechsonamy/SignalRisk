import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { KafkaModule } from './kafka/kafka.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { DlqModule } from './dlq/dlq.module';
import { KafkaHealthModule } from '@signalrisk/kafka-health';
import { KafkaLagController } from './kafka-health/kafka-lag.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    KafkaModule,
    DlqModule,
    EventsModule,
    HealthModule,
    KafkaHealthModule,
  ],
  controllers: [KafkaLagController],
})
export class AppModule {}
