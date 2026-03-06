import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { KeyRotationService } from './key-rotation.service';
import { AdminGuard } from '../merchants/guards/admin.guard';

@ApiTags('auth')
@Controller('v1/auth')
export class KeyRotationController {
  constructor(private readonly keyRotationService: KeyRotationService) {}

  @ApiOperation({ summary: 'Rotate JWT signing keys (admin only)' })
  @ApiResponse({ status: 201, description: 'New key pair generated and activated' })
  @ApiResponse({ status: 401, description: 'Admin JWT required' })
  @Post('rotate-keys')
  @UseGuards(AdminGuard)
  rotateKeys() {
    return this.keyRotationService.rotateKeys();
  }
}
