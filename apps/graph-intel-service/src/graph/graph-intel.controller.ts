import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { GraphIntelService } from './graph-intel.service';
import { SharingResult, VelocityRing, GraphIntelInput, GraphIntelSignal } from './graph.types';

@Controller('graph-intel')
export class GraphIntelController {
  constructor(private readonly graphIntelService: GraphIntelService) {}

  @Post('analyze')
  async analyze(@Body() input: GraphIntelInput): Promise<GraphIntelSignal> {
    return this.graphIntelService.analyze(input);
  }

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
