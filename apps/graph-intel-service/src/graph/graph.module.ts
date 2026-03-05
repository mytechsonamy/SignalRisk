import { Module } from '@nestjs/common';
import { Neo4jDriverProvider } from './graph-driver.provider';
import { GraphIntelService } from './graph-intel.service';
import { GraphIntelController } from './graph-intel.controller';

@Module({
  providers: [Neo4jDriverProvider, GraphIntelService],
  controllers: [GraphIntelController],
  exports: [GraphIntelService],
})
export class GraphModule {}
