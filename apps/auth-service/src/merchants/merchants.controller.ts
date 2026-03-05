import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';

@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMerchantDto) {
    return this.merchantsService.create(dto.name, dto.roles);
  }

  @Get()
  findAll() {
    return this.merchantsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const merchant = this.merchantsService.findById(id);
    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }
    const { clientSecretHash: _, ...safe } = merchant;
    return safe;
  }

  @Post(':id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  async rotateSecret(@Param('id') id: string) {
    const result = await this.merchantsService.rotateSecret(id);
    if (!result) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }
    return result;
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id') id: string) {
    const success = this.merchantsService.deactivate(id);
    if (!success) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }
    return { status: 'deactivated' };
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  activate(@Param('id') id: string) {
    const success = this.merchantsService.activate(id);
    if (!success) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }
    return { status: 'activated' };
  }
}
