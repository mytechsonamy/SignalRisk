/**
 * SignalRisk Network Intel — Network Intelligence Controller
 *
 * POST /v1/network/analyze — accepts NetworkAnalysisParams,
 * returns NetworkSignalResult.
 */

import { Body, Controller, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import {
  NetworkIntelService,
  NetworkAnalysisParams,
  NetworkSignalResult,
} from './network-intel.service';

export class NetworkAnalyzeDto implements NetworkAnalysisParams {
  @IsString()
  ip!: string;

  @IsString()
  merchantId!: string;

  @IsOptional()
  @IsString()
  msisdnCountry?: string;

  @IsOptional()
  @IsString()
  billingCountry?: string;
}

@Controller('v1/network')
export class NetworkIntelController {
  constructor(private readonly networkIntelService: NetworkIntelService) {}

  @Post('analyze')
  async analyze(@Body() body: NetworkAnalyzeDto): Promise<NetworkSignalResult> {
    return this.networkIntelService.analyze(body);
  }
}
