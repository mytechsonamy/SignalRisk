import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { MerchantsService } from './merchants.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { AdminGuard } from './guards/admin.guard';

@ApiTags('merchants')
@UseGuards(AdminGuard)
@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @ApiOperation({ summary: 'Create a new merchant account' })
  @ApiResponse({ status: 201, description: 'Merchant created with client credentials' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMerchantDto) {
    return this.merchantsService.create(dto.name, dto.roles);
  }

  @ApiOperation({ summary: 'List all merchants' })
  @ApiResponse({ status: 200, description: 'Array of merchant records' })
  @Get()
  async findAll() {
    return this.merchantsService.findAllAsync();
  }

  @ApiOperation({ summary: 'Get a merchant by ID' })
  @ApiParam({ name: 'id', description: 'Merchant ID', example: 'merchant-001' })
  @ApiResponse({ status: 200, description: 'Merchant record (without client secret hash)' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const merchant = await this.merchantsService.findById(id);
    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }
    const { clientSecretHash: _, ...safe } = merchant;
    return safe;
  }

  @ApiOperation({ summary: 'Rotate the client secret for a merchant' })
  @ApiParam({ name: 'id', description: 'Merchant ID', example: 'merchant-001' })
  @ApiResponse({ status: 200, description: 'New client_id and client_secret returned' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  @Post(':id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  async rotateSecret(@Param('id') id: string) {
    const result = await this.merchantsService.rotateSecret(id);
    if (!result) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }
    return result;
  }

  @ApiOperation({ summary: 'Deactivate a merchant account' })
  @ApiParam({ name: 'id', description: 'Merchant ID', example: 'merchant-001' })
  @ApiResponse({ status: 200, description: 'Merchant deactivated' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') id: string) {
    const success = await this.merchantsService.deactivate(id);
    if (!success) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }
    return { status: 'deactivated' };
  }

  @ApiOperation({ summary: 'Activate a merchant account' })
  @ApiParam({ name: 'id', description: 'Merchant ID', example: 'merchant-001' })
  @ApiResponse({ status: 200, description: 'Merchant activated' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(@Param('id') id: string) {
    const success = await this.merchantsService.activate(id);
    if (!success) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }
    return { status: 'activated' };
  }
}
