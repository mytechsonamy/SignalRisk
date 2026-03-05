import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { VelocityModule } from './velocity/velocity.module';
import { BurstModule } from './burst/burst.module';
import { HealthModule } from './health/health.module';
import { VelocityEventConsumer } from './consumer/velocity-event.consumer';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    VelocityModule,
    BurstModule,
    HealthModule,
  ],
  providers: [VelocityEventConsumer],
})
export class AppModule {}
