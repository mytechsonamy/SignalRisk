import { Controller, Get } from '@nestjs/common';
import { VelocityService } from '../velocity/velocity.service';

@Controller('health')
export class HealthController {
  constructor(private readonly velocityService: VelocityService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      service: 'velocity-engine',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready() {
    const redis = this.velocityService.getRedis();
    try {
      const pong = await redis.ping();
      return {
        status: pong === 'PONG' ? 'ok' : 'degraded',
        service: 'velocity-engine',
        checks: {
          redis: pong === 'PONG' ? 'up' : 'down',
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'not_ready',
        service: 'velocity-engine',
        checks: {
          redis: 'down',
          error: (error as Error).message,
        },
        timestamp: new Date().toISOString(),
      };
    }
  }
}
