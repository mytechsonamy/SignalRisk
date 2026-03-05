import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KeyManager } from './key-manager';
import { JwtTokenService } from './jwt.service';
import { JwksController } from './jwks.controller';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [JwksController],
  providers: [KeyManager, JwtTokenService],
  exports: [KeyManager, JwtTokenService],
})
export class JwtTokenModule {}
