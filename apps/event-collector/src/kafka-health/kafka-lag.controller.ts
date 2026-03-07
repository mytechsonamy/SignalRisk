import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { KafkaLagService } from '@signalrisk/kafka-health';

@SkipThrottle()
@Controller('metrics')
export class KafkaLagController {
  constructor(private readonly kafkaLagService: KafkaLagService) {}

  @Get('kafka-lag')
  getMetrics(): string {
    return this.kafkaLagService.getPrometheusMetrics();
  }
}
