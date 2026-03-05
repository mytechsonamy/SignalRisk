import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { GraphModule } from './graph/graph.module';
import { KafkaModule } from './kafka/kafka.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    GraphModule,
    KafkaModule,
    HealthModule,
  ],
})
export class AppModule {}
