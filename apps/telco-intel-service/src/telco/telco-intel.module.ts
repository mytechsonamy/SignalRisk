import { Module } from '@nestjs/common';
import { TelcoIntelService } from './telco-intel.service';
import { TelcoIntelController } from './telco-intel.controller';
import { MsisdnLookupService } from '../msisdn/msisdn-lookup.service';

@Module({
  providers: [TelcoIntelService, MsisdnLookupService],
  controllers: [TelcoIntelController],
  exports: [TelcoIntelService, MsisdnLookupService],
})
export class TelcoIntelModule {}
