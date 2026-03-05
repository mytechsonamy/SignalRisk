import { Module } from '@nestjs/common';
import { DecayService } from './decay.service';

@Module({
  providers: [DecayService],
  exports: [DecayService],
})
export class DecayModule {}
