import { Module } from '@nestjs/common';
import { DeviceEventConsumer } from './device-event.consumer';
import { FingerprintModule } from '../fingerprint/fingerprint.module';

@Module({
  imports: [FingerprintModule],
  providers: [DeviceEventConsumer],
  exports: [DeviceEventConsumer],
})
export class DeviceEventConsumerModule {}
