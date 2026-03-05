import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { TokenRequestDto, TokenResponseDto } from './dto';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('oauth/token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ token: { limit: 10, ttl: 60_000 } })
  async token(@Body() dto: TokenRequestDto): Promise<TokenResponseDto> {
    const merchant = await this.authService.validateCredentials(
      dto.client_id,
      dto.client_secret,
    );
    return this.authService.issueToken(merchant);
  }

  @Get('.well-known/jwks.json')
  async jwks() {
    return this.authService.getJwks();
  }
}
