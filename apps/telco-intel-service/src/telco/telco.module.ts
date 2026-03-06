import { Module } from '@nestjs/common';
import { TelcoController } from './telco.controller';
import { TelcoAnalysisService } from './telco-analysis.service';

@Module({
  controllers: [TelcoController],
  providers: [TelcoAnalysisService],
  exports: [TelcoAnalysisService],
})
export class TelcoModule {}
