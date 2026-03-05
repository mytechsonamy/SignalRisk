import { Module } from '@nestjs/common';
import { FingerprintService } from './fingerprint.service';
import { FingerprintController } from './fingerprint.controller';
import { TrustScoreService } from './trust-score.service';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [CacheModule],
  controllers: [FingerprintController],
  providers: [FingerprintService, TrustScoreService],
  exports: [FingerprintService, TrustScoreService],
})
export class FingerprintModule {}
