import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  TokenRequestDto,
  RefreshTokenRequestDto,
  RevokeTokenRequestDto,
  IntrospectTokenRequestDto,
  TokenResponseDto,
  IntrospectResponseDto,
  GrantType,
} from './dto';
import { Public } from './decorators/public.decorator';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /v1/auth/token
   * Issue JWT via client_credentials or password grant.
   */
  @Post('token')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ token: { limit: 10, ttl: 60_000 } })
  async token(@Body() dto: TokenRequestDto): Promise<TokenResponseDto> {
    switch (dto.grant_type) {
      case GrantType.CLIENT_CREDENTIALS: {
        if (!dto.client_id || !dto.client_secret) {
          throw new BadRequestException(
            'client_id and client_secret are required for client_credentials grant',
          );
        }
        const merchant = await this.authService.validateCredentials(
          dto.client_id,
          dto.client_secret,
        );
        return this.authService.issueToken(merchant);
      }

      case GrantType.PASSWORD: {
        if (!dto.username || !dto.password || !dto.merchant_id) {
          throw new BadRequestException(
            'username, password, and merchant_id are required for password grant',
          );
        }
        // In production: validate user credentials against DB
        // For now, return a structured error
        throw new BadRequestException(
          'Password grant requires database user lookup (not yet connected)',
        );
      }

      case GrantType.REFRESH_TOKEN: {
        if (!dto.refresh_token) {
          throw new BadRequestException(
            'refresh_token is required for refresh_token grant',
          );
        }
        return this.authService.refreshAccessToken(dto.refresh_token);
      }

      default:
        throw new BadRequestException(`Unsupported grant_type: ${dto.grant_type}`);
    }
  }

  /**
   * POST /v1/auth/token/refresh
   * Refresh an access token using a refresh token.
   */
  @Post('token/refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ token: { limit: 10, ttl: 60_000 } })
  async refresh(
    @Body() dto: RefreshTokenRequestDto,
  ): Promise<TokenResponseDto> {
    return this.authService.refreshAccessToken(dto.refresh_token);
  }

  /**
   * POST /v1/auth/token/revoke
   * Revoke a refresh token (RFC 7009).
   */
  @Post('token/revoke')
  @Public()
  @HttpCode(HttpStatus.OK)
  async revoke(@Body() dto: RevokeTokenRequestDto): Promise<void> {
    await this.authService.revokeToken(dto.token, dto.token_type_hint);
  }

  /**
   * POST /v1/auth/token/introspect
   * Token introspection (RFC 7662).
   */
  @Post('token/introspect')
  @Public()
  @HttpCode(HttpStatus.OK)
  async introspect(
    @Body() dto: IntrospectTokenRequestDto,
  ): Promise<IntrospectResponseDto> {
    return this.authService.introspectToken(dto.token, dto.token_type_hint);
  }
}
