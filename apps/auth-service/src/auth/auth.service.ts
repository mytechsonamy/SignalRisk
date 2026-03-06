import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { TokenResponseDto, IntrospectResponseDto } from './dto';
import { MerchantsService, Merchant } from '../merchants/merchants.service';
import { JwtTokenService } from '../jwt/jwt.service';
import {
  RefreshTokenStore,
  RefreshTokenEntity,
} from './entities/refresh-token.entity';

const tracer = trace.getTracer('auth-service');

@Injectable()
export class AuthService {
  private readonly refreshTokenStore = new RefreshTokenStore();

  constructor(
    private readonly jwtTokenService: JwtTokenService,
    private readonly configService: ConfigService,
    private readonly merchantsService: MerchantsService,
  ) {}

  async validateCredentials(
    clientId: string,
    clientSecret: string,
  ): Promise<Merchant> {
    return tracer.startActiveSpan('auth.validateCredentials', async (span) => {
      try {
        const merchant = this.merchantsService.findByClientId(clientId);
        if (!merchant) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Unknown client_id',
          });
          throw new UnauthorizedException('Invalid client credentials');
        }

        if (!merchant.active) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Merchant inactive',
          });
          throw new UnauthorizedException('Merchant account is inactive');
        }

        const secretValid = await bcrypt.compare(
          clientSecret,
          merchant.clientSecretHash,
        );
        if (!secretValid) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Invalid secret',
          });
          throw new UnauthorizedException('Invalid client credentials');
        }

        span.setAttribute('merchant.id', merchant.id);
        span.setStatus({ code: SpanStatusCode.OK });
        return merchant;
      } finally {
        span.end();
      }
    });
  }

  async issueToken(merchant: Merchant): Promise<TokenResponseDto> {
    return tracer.startActiveSpan('auth.issueToken', async (span) => {
      try {
        const { accessToken, expiresIn, jti } =
          await this.jwtTokenService.signAccessToken({
            userId: merchant.id,
            merchantId: merchant.id,
            role: merchant.roles[0] || 'merchant',
            permissions: merchant.roles,
          });

        // Generate refresh token
        const refreshResult = this.jwtTokenService.generateRefreshToken(
          merchant.id,
          merchant.id,
        );
        this.refreshTokenStore.save({
          id: refreshResult.jti,
          userId: merchant.id,
          merchantId: merchant.id,
          tokenHash: refreshResult.tokenHash,
          expiresAt: refreshResult.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
        });

        span.setAttribute('merchant.id', merchant.id);
        span.setAttribute('token.jti', jti);
        span.setStatus({ code: SpanStatusCode.OK });

        return {
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: expiresIn,
          refresh_token: refreshResult.token,
        };
      } finally {
        span.end();
      }
    });
  }

  async issueTokenForUser(params: {
    userId: string;
    merchantId: string;
    role: string;
    permissions: string[];
  }): Promise<TokenResponseDto> {
    return tracer.startActiveSpan('auth.issueTokenForUser', async (span) => {
      try {
        const { accessToken, expiresIn, jti } =
          await this.jwtTokenService.signAccessToken(params);

        const refreshResult = this.jwtTokenService.generateRefreshToken(
          params.userId,
          params.merchantId,
        );
        this.refreshTokenStore.save({
          id: refreshResult.jti,
          userId: params.userId,
          merchantId: params.merchantId,
          tokenHash: refreshResult.tokenHash,
          expiresAt: refreshResult.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
        });

        span.setAttribute('user.id', params.userId);
        span.setAttribute('merchant.id', params.merchantId);
        span.setAttribute('token.jti', jti);
        span.setStatus({ code: SpanStatusCode.OK });

        return {
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: expiresIn,
          refresh_token: refreshResult.token,
        };
      } finally {
        span.end();
      }
    });
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<TokenResponseDto> {
    return tracer.startActiveSpan('auth.refreshAccessToken', async (span) => {
      try {
        const tokenHash = JwtTokenService.hashRefreshToken(refreshToken);
        const stored = this.refreshTokenStore.findByTokenHash(tokenHash);

        if (!stored || !this.refreshTokenStore.isValid(stored)) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Invalid refresh token',
          });
          throw new UnauthorizedException('Invalid or expired refresh token');
        }

        // Revoke old refresh token (rotation)
        this.refreshTokenStore.revokeById(stored.id);

        // Look up the merchant's stored role instead of hardcoding 'merchant'
        const merchant = this.merchantsService.findById(stored.userId);
        if (!merchant) throw new UnauthorizedException('Account not found');
        const ROLE_PRIORITY = ['admin', 'analyst', 'merchant'];
        const role = ROLE_PRIORITY.find(r => merchant.roles.includes(r)) ?? 'merchant';
        const permissions = merchant.roles;

        // Issue new token pair
        const { accessToken, expiresIn, jti } =
          await this.jwtTokenService.signAccessToken({
            userId: stored.userId,
            merchantId: stored.merchantId,
            role,
            permissions,
          });

        const newRefresh = this.jwtTokenService.generateRefreshToken(
          stored.userId,
          stored.merchantId,
        );
        this.refreshTokenStore.save({
          id: newRefresh.jti,
          userId: stored.userId,
          merchantId: stored.merchantId,
          tokenHash: newRefresh.tokenHash,
          expiresAt: newRefresh.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
        });

        span.setAttribute('user.id', stored.userId);
        span.setAttribute('token.jti', jti);
        span.setStatus({ code: SpanStatusCode.OK });

        return {
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: expiresIn,
          refresh_token: newRefresh.token,
        };
      } finally {
        span.end();
      }
    });
  }

  async revokeToken(token: string, tokenTypeHint?: string): Promise<void> {
    return tracer.startActiveSpan('auth.revokeToken', async (span) => {
      try {
        // Default to refresh_token revocation
        const tokenHash = JwtTokenService.hashRefreshToken(token);
        const revoked = this.refreshTokenStore.revokeByTokenHash(tokenHash);

        if (!revoked) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Token not found',
          });
          // RFC 7009: revocation endpoint SHOULD return 200 even if token is invalid
        }

        span.setStatus({ code: SpanStatusCode.OK });
      } finally {
        span.end();
      }
    });
  }

  async introspectToken(
    token: string,
    tokenTypeHint?: string,
  ): Promise<IntrospectResponseDto> {
    return tracer.startActiveSpan('auth.introspectToken', async (span) => {
      try {
        // Try as access token first (unless hint says refresh)
        if (tokenTypeHint !== 'refresh_token') {
          try {
            const payload =
              await this.jwtTokenService.verifyAccessToken(token);
            span.setStatus({ code: SpanStatusCode.OK });
            return {
              active: true,
              sub: payload.sub,
              merchant_id: payload.merchant_id,
              role: payload.role,
              permissions: payload.permissions,
              token_type: 'Bearer',
              exp: payload.exp,
              iat: payload.iat,
              iss: 'signalrisk-auth',
              jti: payload.jti,
            };
          } catch {
            // Not a valid access token — fall through
          }
        }

        // Try as refresh token
        const tokenHash = JwtTokenService.hashRefreshToken(token);
        const stored = this.refreshTokenStore.findByTokenHash(tokenHash);
        if (stored && this.refreshTokenStore.isValid(stored)) {
          span.setStatus({ code: SpanStatusCode.OK });
          return {
            active: true,
            sub: stored.userId,
            merchant_id: stored.merchantId,
            token_type: 'refresh_token',
            exp: Math.floor(stored.expiresAt.getTime() / 1000),
            iat: Math.floor(stored.createdAt.getTime() / 1000),
          };
        }

        span.setStatus({ code: SpanStatusCode.OK });
        return { active: false };
      } finally {
        span.end();
      }
    });
  }
}
