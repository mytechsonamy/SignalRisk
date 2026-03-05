import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { WebhookConfig } from './webhook.types';

const TTL_SECONDS = 86400 * 30; // 30 days

@Injectable()
export class WebhookConfigService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookConfigService.name);
  private redis!: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const redisConfig = this.configService.get('redis');
    this.redis = new Redis({
      host: redisConfig?.host || 'localhost',
      port: redisConfig?.port || 6379,
      password: redisConfig?.password,
      db: redisConfig?.db || 0,
      lazyConnect: true,
    });

    this.redis.on('error', (err: Error) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (err) {
      this.logger.error(`Error closing Redis connection: ${(err as Error).message}`);
    }
  }

  async setWebhookConfig(merchantId: string, url: string, secret: string): Promise<void> {
    const key = `webhook:${merchantId}`;
    const value = JSON.stringify({ url, secret });
    await this.redis.set(key, value, 'EX', TTL_SECONDS);
    this.logger.log(`Webhook config stored for merchant ${merchantId}`);
  }

  async getWebhookConfig(merchantId: string): Promise<WebhookConfig | null> {
    const key = `webhook:${merchantId}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as { url: string; secret: string };
      return {
        merchantId,
        url: parsed.url,
        secret: parsed.secret,
      };
    } catch (err) {
      this.logger.error(`Failed to parse webhook config for merchant ${merchantId}: ${(err as Error).message}`);
      return null;
    }
  }

  async deleteWebhookConfig(merchantId: string): Promise<void> {
    const key = `webhook:${merchantId}`;
    await this.redis.del(key);
    this.logger.log(`Webhook config deleted for merchant ${merchantId}`);
  }

  getRedis(): Redis {
    return this.redis;
  }
}
