import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FlagsService } from './flags.service';
import {
  FeatureFlag,
  FlagCheckResult,
  CreateFlagDto,
  UpdateFlagDto,
} from './flags.types';

@Controller('v1/flags')
export class FlagsController {
  constructor(private readonly flagsService: FlagsService) {}

  @Get()
  listFlags(): FeatureFlag[] {
    return this.flagsService.getAll();
  }

  @Get(':name')
  getFlag(@Param('name') name: string): FeatureFlag {
    return this.flagsService.getFlag(name);
  }

  @Get(':name/check')
  checkFlag(
    @Param('name') name: string,
    @Query('merchantId') merchantId: string,
  ): FlagCheckResult {
    return this.flagsService.isEnabled(name, merchantId);
  }

  @Post()
  createFlag(@Body() dto: CreateFlagDto): FeatureFlag {
    return this.flagsService.createFlag(dto);
  }

  @Patch(':name')
  updateFlag(
    @Param('name') name: string,
    @Body() dto: UpdateFlagDto,
  ): FeatureFlag {
    return this.flagsService.updateFlag(name, dto);
  }

  @Delete(':name')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteFlag(@Param('name') name: string): void {
    return this.flagsService.deleteFlag(name);
  }
}
