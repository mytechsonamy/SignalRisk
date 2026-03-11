import { Module } from '@nestjs/common';
import { AdminHealthController } from './admin-health.controller';

@Module({
  controllers: [AdminHealthController],
})
export class AdminModule {}
