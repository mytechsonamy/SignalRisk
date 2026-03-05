import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { VelocityModule } from '../velocity/velocity.module';

@Module({
  imports: [VelocityModule],
  controllers: [HealthController],
})
export class HealthModule {}
