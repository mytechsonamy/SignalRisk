import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { MerchantsModule } from '../merchants/merchants.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [MerchantsModule, TenantModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
