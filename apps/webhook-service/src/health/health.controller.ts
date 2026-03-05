import { Controller, Get } from '@nestjs/common';
import { DecisionConsumerService } from '../kafka/decision-consumer.service';

@Controller('health')
export class HealthController {
  constructor(private readonly consumer: DecisionConsumerService) {}

  @Get()
  check() {
    const kafkaOk = this.consumer.isConnected();
    const status = kafkaOk ? 'ok' : 'degraded';

    return {
      status,
      service: 'webhook-service',
      dependencies: {
        kafka: kafkaOk ? 'connected' : 'disconnected',
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  ready() {
    return {
      status: 'ready',
      service: 'webhook-service',
    };
  }
}
