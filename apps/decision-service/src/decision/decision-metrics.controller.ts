import { Controller, Get } from '@nestjs/common';
import { DecisionProfiler } from './decision-profiler';

@Controller('metrics')
export class DecisionMetricsController {
  constructor(private readonly profiler: DecisionProfiler) {}

  @Get('decision-latency')
  getMetrics(): string {
    return this.profiler.getPrometheusMetrics();
  }
}
