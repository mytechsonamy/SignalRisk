import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  version: string;
  uptime: number;
  timestamp: string;
}

@Controller()
export class HealthController {
  private readonly serviceName: string;
  private readonly version: string;
  private readonly startTime: number;

  constructor(serviceName: string, version = '1.0.0') {
    this.serviceName = serviceName;
    this.version = version;
    this.startTime = Date.now();
  }

  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      service: this.serviceName,
      version: this.version,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
