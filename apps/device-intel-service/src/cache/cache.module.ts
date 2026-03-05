import { Module, Global } from '@nestjs/common';
import { DeviceCacheService } from './device-cache.service';

@Global()
@Module({
  providers: [DeviceCacheService],
  exports: [DeviceCacheService],
})
export class CacheModule {}
