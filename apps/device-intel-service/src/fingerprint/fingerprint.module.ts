import { Module } from '@nestjs/common';
import { FingerprintService } from './fingerprint.service';
import { FingerprintController } from './fingerprint.controller';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [CacheModule],
  controllers: [FingerprintController],
  providers: [FingerprintService],
  exports: [FingerprintService],
})
export class FingerprintModule {}
