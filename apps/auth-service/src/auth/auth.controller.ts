import {
  Controller,
  Post,
  Body,
  Headers,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '@signalrisk/redis-module';
import { AuthService } from './auth.service';
import { JwtTokenService } from '../jwt/jwt.service';
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

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtTokenService: JwtTokenService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * POST /v1/auth/login
   * Dashboard login — email + password → JWT + user info.
   */
  @ApiOperation({ summary: 'Dashboard login (email + password)' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ token: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() body: { email: string; password: string },
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; role: string; merchantId: string };
  }> {
    // Try DB-backed login first
    try {
      const result = await this.authService.loginWithPassword(
        body.email,
        body.password,
      );
      return {
        accessToken: result.access_token,
        refreshToken: result.refresh_token!,
        user: result.user,
      };
    } catch (err) {
      // In production, DB login is the only path
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
      // Development/test fallback: seed users
    }

    // Seed admin users (in-memory, for development ONLY)
    const seedUsers = [
      {
        id: 'usr-admin-001',
        email: 'admin@signalrisk.io',
        password: process.env.SEED_ADMIN_PASSWORD || 'admin123',
        role: 'admin',
        merchantId: 'merchant-signalrisk',
      },
      {
        id: 'usr-analyst-001',
        email: 'analyst@signalrisk.io',
        password: process.env.SEED_ANALYST_PASSWORD || 'analyst123',
        role: 'analyst',
        merchantId: 'merchant-signalrisk',
      },
    ];

    const user = seedUsers.find(
      (u) => u.email === body.email && u.password === body.password,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokenResult = await this.authService.issueTokenForUser({
      userId: user.id,
      merchantId: user.merchantId,
      role: user.role,
      permissions: [user.role],
    });

    return {
      accessToken: tokenResult.access_token,
      refreshToken: tokenResult.refresh_token!,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        merchantId: user.merchantId,
      },
    };
  }

  /**
   * POST /v1/auth/token
   * Issue JWT via client_credentials or password grant.
   */
  @ApiOperation({ summary: 'Issue a JWT access token (OAuth2 token endpoint)' })
  @ApiResponse({ status: 200, description: 'Token issued successfully', type: TokenResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid grant type or missing required fields' })
  @ApiResponse({ status: 401, description: 'Invalid client credentials' })
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
  @ApiOperation({ summary: 'Refresh an access token using a refresh token' })
  @ApiResponse({ status: 200, description: 'New access token issued', type: TokenResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
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
  @ApiOperation({ summary: 'Revoke a token (RFC 7009)' })
  @ApiResponse({ status: 200, description: 'Token revoked successfully' })
  @ApiResponse({ status: 400, description: 'Missing token field' })
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
  @ApiOperation({ summary: 'Introspect a token to check its validity and claims (RFC 7662)' })
  @ApiResponse({ status: 200, description: 'Introspection result', type: IntrospectResponseDto })
  @Post('token/introspect')
  @Public()
  @HttpCode(HttpStatus.OK)
  async introspect(
    @Body() dto: IntrospectTokenRequestDto,
  ): Promise<IntrospectResponseDto> {
    return this.authService.introspectToken(dto.token, dto.token_type_hint);
  }

  /**
   * POST /v1/auth/logout
   * Invalidate the current access token by adding its jti to the Redis denylist.
   * TTL = remaining lifetime of the token so the key auto-expires.
   */
  @ApiOperation({ summary: 'Logout — revoke the current access token (jti denylist)' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @Post('logout')
  @Public()
  async logout(
    @Headers('authorization') authHeader: string,
    @Res() res: Response,
  ): Promise<void> {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authorization header with Bearer token required');
    }

    const payload = await this.jwtTokenService.verifyAccessToken(token);

    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await this.redis.set(`jwt:revoked:${payload.jti}`, '1', 'EX', ttl);
    }

    res.status(200).json({ message: 'Logged out successfully' });
  }
}
