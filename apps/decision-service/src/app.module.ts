import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DecisionModule } from './decision/decision.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { KafkaModule } from './kafka/kafka.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    DecisionModule,
    AnalyticsModule,
    KafkaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
