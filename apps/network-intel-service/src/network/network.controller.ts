import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { NetworkAnalysisService } from './network-analysis.service';
import { NetworkInput, NetworkSignal } from './network.types';

@Controller('v1/network')
export class NetworkController {
  private readonly logger = new Logger(NetworkController.name);

  constructor(private readonly networkAnalysisService: NetworkAnalysisService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  analyze(@Body() input: NetworkInput): NetworkSignal {
    this.logger.log(`Analyzing network signal for IP: ${input.ipAddress ?? 'unknown'}`);
    return this.networkAnalysisService.analyze(input);
  }
}
