import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { FingerprintModule } from './fingerprint/fingerprint.module';
import { CacheModule } from './cache/cache.module';
import { DeviceEventConsumerModule } from './consumer/device-event-consumer.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    CacheModule,
    FingerprintModule,
    DeviceEventConsumerModule,
    HealthModule,
  ],
})
export class AppModule {}
