import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { UsersService, AdminUserDto } from './users.service';
import { TenantContextService } from '../tenant/tenant-context.service';

@Controller('v1/admin/users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  async findAll(): Promise<AdminUserDto[]> {
    const ctx = this.tenantContext.getContext()!;
    return this.usersService.findAllByMerchant(ctx.merchantId);
  }

  @Post('invite')
  async invite(
    @Body() body: { email: string; role: string },
  ): Promise<AdminUserDto & { tempPassword: string }> {
    const ctx = this.tenantContext.getContext()!;
    return this.usersService.invite(ctx.merchantId, body.email, body.role);
  }

  @Patch(':id/password')
  @HttpCode(HttpStatus.OK)
  async setPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { newPassword: string },
  ): Promise<{ success: boolean }> {
    const ctx = this.tenantContext.getContext()!;
    // Authorization: admin can change any user in tenant,
    // non-admin can only change own password
    if (ctx.role !== 'admin' && ctx.userId !== id) {
      throw new ForbiddenException("Cannot change another user's password");
    }
    const success = await this.usersService.setPassword(
      ctx.merchantId,
      id,
      body.newPassword,
    );
    if (!success) {
      throw new NotFoundException('User not found');
    }
    return { success: true };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    const ctx = this.tenantContext.getContext()!;
    await this.usersService.deactivate(ctx.merchantId, id);
  }
}
