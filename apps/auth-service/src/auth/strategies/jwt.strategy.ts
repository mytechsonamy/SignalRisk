import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  client_id: string;
  merchant_name: string;
  roles: string[];
  jti: string;
  iat: number;
  exp: number;
  iss: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_PUBLIC_KEY'),
      algorithms: ['RS256'],
      issuer: configService.get<string>('JWT_ISSUER', 'signalrisk-auth'),
    });
  }

  validate(payload: JwtPayload) {
    return {
      merchantId: payload.sub,
      clientId: payload.client_id,
      merchantName: payload.merchant_name,
      roles: payload.roles,
      jti: payload.jti,
    };
  }
}
