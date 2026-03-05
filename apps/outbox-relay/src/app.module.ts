import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { OutboxRelayModule } from './relay/outbox-relay.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    OutboxRelayModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
