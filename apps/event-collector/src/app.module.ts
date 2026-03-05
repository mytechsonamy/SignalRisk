import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { KafkaModule } from './kafka/kafka.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { DlqModule } from './dlq/dlq.module';

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
  ],
})
export class AppModule {}
