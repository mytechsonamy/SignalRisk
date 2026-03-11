import { Controller, Get } from '@nestjs/common';

interface ServiceHealthDto {
  name: string;
  port: number;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number | null;
  lastChecked: string;
}

const SERVICES = [
  { name: 'auth-service', port: 3001 },
  { name: 'event-collector', port: 3002 },
  { name: 'device-intel-service', port: 3003 },
  { name: 'velocity-service', port: 3004 },
  { name: 'behavioral-service', port: 3005 },
  { name: 'network-intel-service', port: 3006 },
  { name: 'telco-intel-service', port: 3007 },
  { name: 'rule-engine-service', port: 3008 },
  { name: 'decision-service', port: 3009 },
  { name: 'case-service', port: 3010 },
  { name: 'webhook-service', port: 3011 },
  { name: 'graph-intel-service', port: 3012 },
  { name: 'feature-flag-service', port: 3013 },
  { name: 'outbox-relay', port: 3014 },
];

@Controller('v1/admin')
export class AdminHealthController {
  @Get('health')
  async getHealth(): Promise<ServiceHealthDto[]> {
    const results = await Promise.all(
      SERVICES.map(async (svc) => {
        const start = Date.now();
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(`http://${svc.name}:${svc.port}/health`, {
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const latencyMs = Date.now() - start;
          return {
            name: svc.name,
            port: svc.port,
            status: res.ok ? 'healthy' : 'degraded',
            latencyMs,
            lastChecked: new Date().toISOString(),
          } as ServiceHealthDto;
        } catch {
          return {
            name: svc.name,
            port: svc.port,
            status: 'down',
            latencyMs: null,
            lastChecked: new Date().toISOString(),
          } as ServiceHealthDto;
        }
      }),
    );
    return results;
  }
}
