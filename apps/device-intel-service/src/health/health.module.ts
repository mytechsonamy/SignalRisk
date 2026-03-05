import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { FingerprintModule } from '../fingerprint/fingerprint.module';
import { DeviceEventConsumerModule } from '../consumer/device-event-consumer.module';

@Module({
  imports: [FingerprintModule, DeviceEventConsumerModule],
  controllers: [HealthController],
})
export class HealthModule {}
