import { Controller, Get } from '@nestjs/common';
import { KafkaLagService } from '../../../../packages/kafka-health/src';

@Controller('metrics')
export class KafkaLagController {
  constructor(private readonly kafkaLagService: KafkaLagService) {}

  @Get('kafka-lag')
  getMetrics(): string {
    return this.kafkaLagService.getPrometheusMetrics();
  }
}
