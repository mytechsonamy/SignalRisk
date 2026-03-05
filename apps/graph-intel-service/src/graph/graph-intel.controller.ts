import { Controller, Get, Param } from '@nestjs/common';
import { GraphIntelService } from './graph-intel.service';
import { SharingResult, VelocityRing } from './graph.types';

@Controller('v1/graph')
export class GraphIntelController {
  constructor(private readonly graphIntelService: GraphIntelService) {}

  @Get('device/:id/sharing')
  async getDeviceSharing(@Param('id') deviceId: string): Promise<SharingResult> {
    return this.graphIntelService.detectDeviceSharing(deviceId);
  }

  @Get('merchant/:id/rings')
  async getVelocityRings(@Param('id') merchantId: string): Promise<VelocityRing> {
    return this.graphIntelService.detectVelocityRing(merchantId);
  }

  @Get('device/:id/neighbors')
  async getDeviceNeighbors(@Param('id') deviceId: string) {
    return this.graphIntelService.getDeviceNeighbors(deviceId);
  }
}
