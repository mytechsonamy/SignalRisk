import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { KafkaService } from '../kafka/kafka.service';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly kafkaService: KafkaService) {}

  @Get()
  check() {
    return {
      status: this.kafkaService.isConnected() ? 'ok' : 'degraded',
      service: 'event-collector',
      kafka: this.kafkaService.isConnected() ? 'connected' : 'disconnected',
      consumerLag: this.kafkaService.getConsumerLag(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  readiness() {
    if (!this.kafkaService.isConnected()) {
      return {
        status: 'not_ready',
        service: 'event-collector',
        reason: 'Kafka producer not connected',
      };
    }

    return {
      status: 'ready',
      service: 'event-collector',
    };
  }
}
