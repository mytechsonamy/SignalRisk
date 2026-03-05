import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiJ9...' })
  access_token: string;

  @ApiProperty({ example: 'Bearer' })
  token_type: string;

  @ApiProperty({ example: 900 })
  expires_in: number;

  @ApiPropertyOptional({ example: 'rt_eyJhbGciOiJSUzI1NiJ9...' })
  refresh_token?: string;
}

export class IntrospectResponseDto {
  @ApiProperty({ example: true })
  active: boolean;

  @ApiPropertyOptional({ example: 'merchant-001' })
  sub?: string;

  @ApiPropertyOptional({ example: 'merchant-001' })
  merchant_id?: string;

  @ApiPropertyOptional({ example: 'merchant' })
  role?: string;

  @ApiPropertyOptional({ example: ['events:write', 'decisions:read'] })
  permissions?: string[];

  @ApiPropertyOptional({ example: 'merchant-001' })
  client_id?: string;

  @ApiPropertyOptional({ example: 'access_token' })
  token_type?: string;

  @ApiPropertyOptional({ example: 1741276800 })
  exp?: number;

  @ApiPropertyOptional({ example: 1741272900 })
  iat?: number;

  @ApiPropertyOptional({ example: 'https://auth.signalrisk.io' })
  iss?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-uuid' })
  jti?: string;
}
