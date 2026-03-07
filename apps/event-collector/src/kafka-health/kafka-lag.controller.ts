import { Controller, Get } from '@nestjs/common';
import { KafkaLagService } from '@signalrisk/kafka-health';

@Controller('metrics')
export class KafkaLagController {
  constructor(private readonly kafkaLagService: KafkaLagService) {}

  @Get('kafka-lag')
  getMetrics(): string {
    return this.kafkaLagService.getPrometheusMetrics();
  }
}
