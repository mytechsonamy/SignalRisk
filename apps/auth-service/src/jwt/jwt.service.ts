import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { KeyManager } from './key-manager';

export interface AccessTokenPayload {
  sub: string;
  merchant_id: string;
  role: string;
  permissions: string[];
  jti: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenResult {
  token: string;
  tokenHash: string;
  jti: string;
  expiresAt: Date;
}

const tracer = trace.getTracer('auth-service');

@Injectable()
export class JwtTokenService {
  private readonly accessTokenTtl: number;
  private readonly refreshTokenTtl: number;
  private readonly issuer: string;

  constructor(
    private readonly keyManager: KeyManager,
    private readonly configService: ConfigService,
  ) {
    this.accessTokenTtl = this.configService.get<number>(
      'JWT_ACCESS_TOKEN_TTL_SECONDS',
      900, // 15 minutes
    );
    this.refreshTokenTtl = this.configService.get<number>(
      'JWT_REFRESH_TOKEN_TTL_SECONDS',
      604800, // 7 days
    );
    this.issuer = this.configService.get<string>(
      'JWT_ISSUER',
      'signalrisk-auth',
    );
  }

  async signAccessToken(claims: {
    userId: string;
    merchantId: string;
    role: string;
    permissions: string[];
  }): Promise<{ accessToken: string; expiresIn: number; jti: string }> {
    return tracer.startActiveSpan('jwt.signAccessToken', async (span) => {
      try {
        const signingKey = this.keyManager.getCurrentSigningKey();
        const jti = crypto.randomUUID();
        const now = Math.floor(Date.now() / 1000);

        const payload = {
          sub: claims.userId,
          merchant_id: claims.merchantId,
          role: claims.role,
          permissions: claims.permissions,
          jti,
        };

        const accessToken = jwt.sign(payload, signingKey.privateKey, {
          algorithm: 'RS256',
          expiresIn: this.accessTokenTtl,
          issuer: this.issuer,
          keyid: signingKey.kid,
        });

        span.setAttribute('jwt.kid', signingKey.kid);
        span.setAttribute('jwt.jti', jti);
        span.setStatus({ code: SpanStatusCode.OK });

        return { accessToken, expiresIn: this.accessTokenTtl, jti };
      } finally {
        span.end();
      }
    });
  }

  generateRefreshToken(
    userId: string,
    merchantId: string,
  ): RefreshTokenResult {
    const jti = crypto.randomUUID();
    const token = crypto.randomBytes(48).toString('base64url');
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    const expiresAt = new Date(
      Date.now() + this.refreshTokenTtl * 1000,
    );

    return { token, tokenHash, jti, expiresAt };
  }

  static hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return tracer.startActiveSpan('jwt.verifyAccessToken', async (span) => {
      try {
        // Decode header to get kid
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || typeof decoded === 'string') {
          throw new UnauthorizedException('Invalid token format');
        }

        const kid = decoded.header.kid;
        if (!kid) {
          throw new UnauthorizedException('Token missing kid header');
        }

        const key = this.keyManager.getKeyByKid(kid);
        if (!key) {
          throw new UnauthorizedException(`Unknown signing key: ${kid}`);
        }

        const payload = jwt.verify(token, key.publicKey, {
          algorithms: ['RS256'],
          issuer: this.issuer,
        }) as AccessTokenPayload;

        span.setAttribute('jwt.kid', kid);
        span.setAttribute('jwt.sub', payload.sub);
        span.setStatus({ code: SpanStatusCode.OK });

        return payload;
      } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Token expired' });
          throw new UnauthorizedException('Token expired');
        }
        if (err instanceof jwt.JsonWebTokenError) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid token' });
          throw new UnauthorizedException('Invalid token');
        }
        throw err;
      } finally {
        span.end();
      }
    });
  }

  get accessTokenTtlSeconds(): number {
    return this.accessTokenTtl;
  }

  get refreshTokenTtlSeconds(): number {
    return this.refreshTokenTtl;
  }
}
