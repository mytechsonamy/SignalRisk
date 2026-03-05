import { Module } from '@nestjs/common';
import { ThresholdRandomizer } from './threshold-randomizer';

@Module({
  providers: [ThresholdRandomizer],
  exports: [ThresholdRandomizer],
})
export class DslModule {}
