import { DynamicModule, Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({})
export class HealthModule {
  static forService(serviceName: string, version?: string): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [{ provide: 'HEALTH_SERVICE_NAME', useValue: serviceName }],
    };
  }
}
