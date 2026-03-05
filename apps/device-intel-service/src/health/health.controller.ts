import { Controller, Get } from '@nestjs/common';
import { DeviceCacheService } from '../cache/device-cache.service';
import { FingerprintService } from '../fingerprint/fingerprint.service';
import { DeviceEventConsumer } from '../consumer/device-event.consumer';

@Controller('health')
export class HealthController {
  constructor(
    private readonly cacheService: DeviceCacheService,
    private readonly fingerprintService: FingerprintService,
    private readonly consumer: DeviceEventConsumer,
  ) {}

  @Get()
  async check() {
    const redisOk = this.cacheService.isConnected();

    let dbOk = false;
    try {
      const pool = this.fingerprintService.getPool();
      const result = await pool.query('SELECT 1');
      dbOk = result.rows.length > 0;
    } catch {
      dbOk = false;
    }

    const kafkaOk = this.consumer.isConnected();

    const status = dbOk && redisOk && kafkaOk ? 'ok' : 'degraded';

    return {
      status,
      service: 'device-intel-service',
      dependencies: {
        database: dbOk ? 'connected' : 'disconnected',
        redis: redisOk ? 'connected' : 'disconnected',
        kafka: kafkaOk ? 'connected' : 'disconnected',
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async readiness() {
    let dbOk = false;
    try {
      const pool = this.fingerprintService.getPool();
      const result = await pool.query('SELECT 1');
      dbOk = result.rows.length > 0;
    } catch {
      dbOk = false;
    }

    if (!dbOk) {
      return {
        status: 'not_ready',
        service: 'device-intel-service',
        reason: 'Database not connected',
      };
    }

    return {
      status: 'ready',
      service: 'device-intel-service',
    };
  }
}
