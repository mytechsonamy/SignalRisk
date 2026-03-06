import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MerchantRateLimitService } from './merchant-rate-limit.service';
import { MerchantRateLimitGuard } from './merchant-rate-limit.guard';
import { RedisModule } from '@signalrisk/redis-module';

@Module({
  imports: [ConfigModule, RedisModule.forRoot()],
  providers: [MerchantRateLimitService, MerchantRateLimitGuard],
  exports: [MerchantRateLimitService, MerchantRateLimitGuard],
})
export class RateLimitModule {}
