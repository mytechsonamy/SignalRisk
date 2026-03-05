import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  NotFoundException,
  ParseIntPipe,
  DefaultValuePipe,
  Logger,
} from '@nestjs/common';
import { CaseService } from './case.service';
import { UpdateCaseDto } from './dto/update-case.dto';
import { BulkActionDto } from './dto/bulk-action.dto';
import { CasePriority, CaseStatus } from './case.types';

@Controller('v1/cases')
export class CaseController {
  private readonly logger = new Logger(CaseController.name);

  constructor(private readonly caseService: CaseService) {}

  @Get()
  async listCases(
    @Query('merchantId') merchantId: string,
    @Query('status') status?: CaseStatus,
    @Query('priority') priority?: CasePriority,
    @Query('assignedTo') assignedTo?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    const safeLimit = Math.min(limit, 100);
    const safePage = Math.max(page, 1);

    return this.caseService.listCases({
      merchantId,
      status,
      priority,
      assignedTo,
      search,
      page: safePage,
      limit: safeLimit,
    });
  }

  @Get(':id')
  async getCase(
    @Param('id') id: string,
    @Query('merchantId') merchantId: string,
  ) {
    const c = await this.caseService.getCase(id, merchantId);
    if (!c) {
      throw new NotFoundException(`Case ${id} not found`);
    }
    return c;
  }

  @Patch(':id')
  async updateCase(
    @Param('id') id: string,
    @Query('merchantId') merchantId: string,
    @Body() body: UpdateCaseDto,
  ) {
    return this.caseService.updateCase(id, merchantId, body);
  }

  @Post('bulk')
  async bulkAction(
    @Query('merchantId') merchantId: string,
    @Body() body: BulkActionDto,
  ) {
    return this.caseService.bulkAction(body.ids, merchantId, body);
  }
}
