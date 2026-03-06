import { Injectable, Logger, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../../packages/redis-module/src';

@Injectable()
export class DecisionCacheService {
  private readonly logger = new Logger(DecisionCacheService.name);
  private readonly TTL_SECONDS = 5;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

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
