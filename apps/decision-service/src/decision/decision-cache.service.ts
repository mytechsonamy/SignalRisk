import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DecisionCacheService {
  private readonly logger = new Logger(DecisionCacheService.name);
  private readonly TTL_SECONDS = 5;
  private redis: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      lazyConnect: false,
    });
  }

  async onModuleDestroy() { await this.redis.quit(); }

  cacheKey(merchantId: string, entityId: string): string {
    return `decision:cache:${merchantId}:${entityId}`;
  }

  async get(merchantId: string, entityId: string): Promise<any | null> {
    try {
      const cached = await this.redis.get(this.cacheKey(merchantId, entityId));
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      this.logger.warn(`Cache get error: ${(err as Error)?.message}`);
      return null;
    }
  }

  async set(merchantId: string, entityId: string, result: any): Promise<void> {
    await this.redis.set(
      this.cacheKey(merchantId, entityId),
      JSON.stringify(result),
      'EX',
      this.TTL_SECONDS,
    );
  }

  async invalidate(merchantId: string, entityId: string): Promise<void> {
    await this.redis.del(this.cacheKey(merchantId, entityId));
  }
}
