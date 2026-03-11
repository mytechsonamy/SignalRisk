import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { Pool } from 'pg';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenStore } from './entities/refresh-token.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { MerchantsModule, PG_POOL } from '../merchants/merchants.module';
import { UsersModule } from '../users/users.module';
import { KeyRotationService } from './key-rotation.service';
import { KeyRotationController } from './key-rotation.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    MerchantsModule,
    UsersModule,
  ],
  controllers: [AuthController, KeyRotationController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    KeyRotationService,
    {
      provide: RefreshTokenStore,
      useFactory: (pool: Pool) => new RefreshTokenStore(pool),
      inject: [PG_POOL],
    },
  ],
  exports: [AuthService, JwtAuthGuard, RolesGuard, KeyRotationService],
})
export class AuthModule {}
