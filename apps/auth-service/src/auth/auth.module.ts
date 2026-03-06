import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { MerchantsModule } from '../merchants/merchants.module';
import { KeyRotationService } from './key-rotation.service';
import { KeyRotationController } from './key-rotation.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    MerchantsModule,
  ],
  controllers: [AuthController, KeyRotationController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard, KeyRotationService],
  exports: [AuthService, JwtAuthGuard, RolesGuard, KeyRotationService],
})
export class AuthModule {}
