import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  connectTimeout?: number;
  maxRetriesPerRequest?: number;
}

@Global()
@Module({})
export class RedisModule {
  static forRoot(config?: RedisConfig): DynamicModule {
    return {
      module: RedisModule,
      global: true,
      imports: [ConfigModule],
      providers: [
        {
          provide: REDIS_CLIENT,
          useFactory: (configService: ConfigService) => {
            return new Redis({
              host: config?.host ?? configService.get<string>('REDIS_HOST', 'localhost'),
              port: config?.port ?? configService.get<number>('REDIS_PORT', 6379),
              password: config?.password ?? configService.get<string>('REDIS_PASSWORD') ?? undefined,
              db: config?.db ?? configService.get<number>('REDIS_DB', 0),
              connectTimeout: config?.connectTimeout ?? 5000,
              maxRetriesPerRequest: config?.maxRetriesPerRequest ?? 3,
              lazyConnect: false,
            });
          },
          inject: [ConfigService],
        },
      ],
      exports: [REDIS_CLIENT],
    };
  }
}
