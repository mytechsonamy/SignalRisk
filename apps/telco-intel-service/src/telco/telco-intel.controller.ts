/**
 * SignalRisk Telco Intel — REST Controller
 *
 * POST /v1/telco/analyze — Accept TelcoAnalysisParams, return TelcoResult.
 */

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { TelcoIntelService, TelcoAnalysisParams, TelcoResult } from './telco-intel.service';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';

class TelcoAnalysisDto implements TelcoAnalysisParams {
  @IsString()
  @MinLength(1)
  msisdn!: string;

  @IsString()
  @MinLength(1)
  merchantId!: string;

  @IsOptional()
  @IsBoolean()
  isPorted?: boolean;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? new Date(value) : value,
  )
  @Type(() => Date)
  portDate?: Date;

  @IsOptional()
  @IsIn(['prepaid', 'postpaid'])
  payguruLineType?: 'prepaid' | 'postpaid';
}

@Controller('v1/telco')
export class TelcoIntelController {
  constructor(private readonly telcoIntelService: TelcoIntelService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  analyze(@Body() dto: TelcoAnalysisDto): TelcoResult {
    return this.telcoIntelService.analyze(dto);
  }
}
