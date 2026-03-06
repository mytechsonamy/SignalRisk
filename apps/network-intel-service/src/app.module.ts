import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NetworkModule } from './network/network.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    NetworkModule,
    HealthModule,
  ],
})
export class AppModule {}
