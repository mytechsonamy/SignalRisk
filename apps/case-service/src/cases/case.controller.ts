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
import { ApiOperation, ApiResponse, ApiTags, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CaseService } from './case.service';
import { CaseExportService } from './case-export.service';
import { UpdateCaseDto } from './dto/update-case.dto';
import { BulkActionDto } from './dto/bulk-action.dto';
import { CasePriority, CaseStatus } from './case.types';

@ApiTags('cases')
@Controller('v1/cases')
export class CaseController {
  private readonly logger = new Logger(CaseController.name);

  constructor(
    private readonly caseService: CaseService,
    private readonly caseExportService: CaseExportService,
  ) {}

  @ApiOperation({ summary: 'List fraud cases for a merchant with optional filters' })
  @ApiQuery({ name: 'merchantId', required: true, example: 'merchant-001' })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED'] })
  @ApiQuery({ name: 'priority', required: false, enum: ['HIGH', 'MEDIUM', 'LOW'] })
  @ApiQuery({ name: 'assignedTo', required: false, example: 'analyst@acme.com' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by entityId', example: 'user-123' })
  @ApiQuery({ name: 'slaBreached', required: false, description: 'Filter by SLA breach status', example: 'true' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated list of cases' })
  @Get()
  async listCases(
    @Query('merchantId') merchantId: string,
    @Query('status') status?: CaseStatus,
    @Query('priority') priority?: CasePriority,
    @Query('assignedTo') assignedTo?: string,
    @Query('search') search?: string,
    @Query('slaBreached') slaBreached?: string,
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
      slaBreached: slaBreached === 'true' ? true : slaBreached === 'false' ? false : undefined,
      page: safePage,
      limit: safeLimit,
    });
  }

  @ApiOperation({ summary: 'Export all cases for an entity (GDPR Art. 15)' })
  @ApiQuery({ name: 'merchantId', required: true, example: 'merchant-001' })
  @ApiQuery({ name: 'entityId', required: true, example: 'user-123' })
  @ApiResponse({ status: 200, description: 'List of all cases for the entity' })
  @Get('export')
  async exportCases(
    @Query('merchantId') merchantId: string,
    @Query('entityId') entityId: string,
  ) {
    return this.caseExportService.exportEntityCases(merchantId, entityId);
  }

  @ApiOperation({ summary: 'Get a single fraud case by ID' })
  @ApiParam({ name: 'id', description: 'Case ID', example: 'case-abc123' })
  @ApiQuery({ name: 'merchantId', required: true, example: 'merchant-001' })
  @ApiResponse({ status: 200, description: 'Case record' })
  @ApiResponse({ status: 404, description: 'Case not found' })
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

  @ApiOperation({ summary: 'Update a case status, assignment, or resolution' })
  @ApiParam({ name: 'id', description: 'Case ID', example: 'case-abc123' })
  @ApiQuery({ name: 'merchantId', required: true, example: 'merchant-001' })
  @ApiResponse({ status: 200, description: 'Updated case record' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  @Patch(':id')
  async updateCase(
    @Param('id') id: string,
    @Query('merchantId') merchantId: string,
    @Body() body: UpdateCaseDto,
  ) {
    return this.caseService.updateCase(id, merchantId, body);
  }

  @ApiOperation({ summary: 'Perform a bulk action (RESOLVE, ESCALATE, or ASSIGN) on multiple cases' })
  @ApiQuery({ name: 'merchantId', required: true, example: 'merchant-001' })
  @ApiResponse({ status: 200, description: 'Bulk action result with affected case IDs' })
  @ApiResponse({ status: 400, description: 'Invalid action or empty IDs array' })
  @Post('bulk')
  async bulkAction(
    @Query('merchantId') merchantId: string,
    @Body() body: BulkActionDto,
  ) {
    return this.caseService.bulkAction(body.ids, merchantId, body);
  }
}
