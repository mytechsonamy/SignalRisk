import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { KeyManager } from '../../jwt/key-manager';

export interface JwtPayload {
  sub: string;
  merchant_id: string;
  role: string;
  permissions: string[];
  jti: string;
  iat: number;
  exp: number;
  iss: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly keyManager: KeyManager,
  ) {
    // Use the current signing key's public key for verification
    const signingKey = keyManager.getCurrentSigningKey();
    const publicKeyPem = signingKey.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKeyPem,
      algorithms: ['RS256'],
      issuer: configService.get<string>('JWT_ISSUER', 'signalrisk-auth'),
    });
  }

  validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      merchantId: payload.merchant_id,
      role: payload.role,
      permissions: payload.permissions,
      jti: payload.jti,
    };
  }
}
