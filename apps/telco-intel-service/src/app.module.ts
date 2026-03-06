import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelcoModule } from './telco/telco.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TelcoModule,
    HealthModule,
  ],
})
export class AppModule {}
