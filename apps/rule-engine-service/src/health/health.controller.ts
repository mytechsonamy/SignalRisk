import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'rule-engine-service',
      timestamp: new Date().toISOString(),
    };
  }
}
