import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { TelcoAnalysisService } from './telco-analysis.service';
import { TelcoInput, TelcoSignal } from './telco.types';

@Controller('v1/telco')
export class TelcoController {
  private readonly logger = new Logger(TelcoController.name);

  constructor(private readonly telcoAnalysisService: TelcoAnalysisService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  analyze(@Body() input: TelcoInput): TelcoSignal {
    this.logger.log(`Analyzing telco signal for number: ${input.phoneNumber ?? 'unknown'}`);
    return this.telcoAnalysisService.analyze(input);
  }
}
