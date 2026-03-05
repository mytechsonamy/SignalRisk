import { Module, forwardRef } from '@nestjs/common';
import { VelocityService } from './velocity.service';
import { VelocityController } from './velocity.controller';
import { BurstModule } from '../burst/burst.module';

@Module({
  imports: [forwardRef(() => BurstModule)],
  controllers: [VelocityController],
  providers: [VelocityService],
  exports: [VelocityService],
})
export class VelocityModule {}
