import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtTokenModule } from './jwt/jwt.module';
import { AuthModule } from './auth/auth.module';
import { MerchantsModule } from './merchants/merchants.module';
import { HealthModule } from './health/health.module';
import { TenantModule } from './tenant/tenant.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { RateLimitModule } from './rate-limit/rate-limit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'token',
        ttl: 60_000,
        limit: 30,
      },
    ]),
    JwtTokenModule,
    AuthModule,
    MerchantsModule,
    HealthModule,
    TenantModule,
    RateLimitModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply TenantMiddleware globally to all routes.
    // It sets the AsyncLocalStorage tenant context (merchantId, userId, role)
    // for every request that carries a valid Bearer JWT token.
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
