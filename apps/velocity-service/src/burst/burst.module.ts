import { Module, forwardRef } from '@nestjs/common';
import { BurstService } from './burst.service';
import { VelocityModule } from '../velocity/velocity.module';
import { DecayModule } from '../decay/decay.module';

@Module({
  imports: [forwardRef(() => VelocityModule), DecayModule],
  providers: [BurstService],
  exports: [BurstService],
})
export class BurstModule {}
