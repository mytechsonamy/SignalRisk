import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtTokenModule } from './jwt/jwt.module';
import { AuthModule } from './auth/auth.module';
import { MerchantsModule } from './merchants/merchants.module';
import { HealthModule } from './health/health.module';

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
  ],
})
export class AppModule {}
