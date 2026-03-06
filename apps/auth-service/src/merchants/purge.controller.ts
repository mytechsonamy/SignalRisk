import {
  Controller,
  Param,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PurgeService } from './purge.service';
import { AdminGuard } from './guards/admin.guard';

@ApiTags('merchants')
@Controller('v1/merchants')
export class PurgeController {
  constructor(private readonly purgeService: PurgeService) {}

  @Post(':id/purge')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'GDPR purge: soft-delete merchant and revoke all API keys' })
  @ApiParam({ name: 'id', description: 'Merchant ID' })
  @ApiResponse({ status: 204, description: 'Merchant purged successfully' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized — admin JWT required' })
  async purgeMerchant(@Param('id') id: string): Promise<void> {
    await this.purgeService.purgeMerchant(id);
  }
}
