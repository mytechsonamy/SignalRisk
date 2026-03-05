import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { TokenResponseDto } from './dto';
import { MerchantsService, Merchant } from '../merchants/merchants.service';

export interface JwksKey {
  kty: string;
  use: string;
  kid: string;
  alg: string;
  n: string;
  e: string;
}

const tracer = trace.getTracer('auth-service');

@Injectable()
export class AuthService {
  private readonly tokenExpiresIn: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly merchantsService: MerchantsService,
  ) {
    this.tokenExpiresIn = this.configService.get<number>(
      'JWT_EXPIRES_IN_SECONDS',
      3600,
    );
  }

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
        const jti = crypto.randomUUID();
        const payload = {
          sub: merchant.id,
          client_id: merchant.clientId,
          merchant_name: merchant.name,
          roles: merchant.roles,
          jti,
        };

        const accessToken = await this.jwtService.signAsync(payload, {
          expiresIn: this.tokenExpiresIn,
        });

        span.setAttribute('merchant.id', merchant.id);
        span.setAttribute('token.jti', jti);
        span.setStatus({ code: SpanStatusCode.OK });

        return {
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: this.tokenExpiresIn,
        };
      } finally {
        span.end();
      }
    });
  }

  async getJwks(): Promise<{ keys: JwksKey[] }> {
    const publicKey = this.configService.get<string>('JWT_PUBLIC_KEY');
    if (!publicKey) {
      return { keys: [] };
    }

    const keyObject = crypto.createPublicKey(publicKey);
    const jwk = keyObject.export({ format: 'jwk' });

    return {
      keys: [
        {
          kty: jwk.kty as string,
          use: 'sig',
          kid: this.configService.get<string>('JWT_KID', 'signalrisk-auth-1'),
          alg: 'RS256',
          n: jwk.n as string,
          e: jwk.e as string,
        },
      ],
    };
  }
}
