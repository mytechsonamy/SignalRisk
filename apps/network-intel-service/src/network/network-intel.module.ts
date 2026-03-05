import { Module } from '@nestjs/common';
import { NetworkIntelService } from './network-intel.service';
import { NetworkIntelController } from './network-intel.controller';
import { GeoIpService } from '../geo/geo-ip.service';
import { GeoMismatchService } from '../geo/geo-mismatch.service';

@Module({
  controllers: [NetworkIntelController],
  providers: [NetworkIntelService, GeoIpService, GeoMismatchService],
  exports: [NetworkIntelService, GeoIpService, GeoMismatchService],
})
export class NetworkIntelModule {}
