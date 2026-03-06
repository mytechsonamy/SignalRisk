import { Module } from '@nestjs/common';
import { NetworkController } from './network.controller';
import { NetworkAnalysisService } from './network-analysis.service';

@Module({
  controllers: [NetworkController],
  providers: [NetworkAnalysisService],
  exports: [NetworkAnalysisService],
})
export class NetworkModule {}
