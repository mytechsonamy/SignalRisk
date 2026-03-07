import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BehavioralModule } from './behavioral/behavioral.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BehavioralModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
