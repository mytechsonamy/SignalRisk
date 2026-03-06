import { Module } from '@nestjs/common';
import { FlagsRepository } from './flags.repository';
import { FlagsService } from './flags.service';
import { FlagsController } from './flags.controller';
import { FlagsClient } from './flags.client';

@Module({
  controllers: [FlagsController],
  providers: [FlagsRepository, FlagsService, FlagsClient],
  exports: [FlagsService, FlagsClient],
})
export class FlagsModule {}
