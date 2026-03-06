import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MerchantService } from './merchant.service';
import { AdminGuard } from './guards/admin.guard';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { ApiKeyAuditService } from './api-key-audit.service';

@Controller('v1/merchants')
@UseGuards(AdminGuard)
export class MerchantController {
  constructor(
    private readonly merchantService: MerchantService,
    private readonly apiKeyAuditService: ApiKeyAuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMerchantDto) {
    return this.merchantService.createMerchant(dto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.merchantService.getMerchant(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateMerchantDto) {
    return this.merchantService.updateMerchant(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.merchantService.deleteMerchant(id);
  }

  @Post(':id/rotate-key')
  @HttpCode(HttpStatus.OK)
  async rotateKey(@Param('id') id: string) {
    return this.merchantService.rotateApiKey(id);
  }

  @Get(':id/api-keys/audit')
  @HttpCode(HttpStatus.OK)
  async getApiKeyAudit(
    @Param('id') id: string,
    @Query('keyPrefix') keyPrefix: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 100;
    return this.apiKeyAuditService.getRecentUsage(id, keyPrefix || '', limitNum);
  }
}
