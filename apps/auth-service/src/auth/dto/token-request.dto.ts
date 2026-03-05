import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum GrantType {
  CLIENT_CREDENTIALS = 'client_credentials',
  PASSWORD = 'password',
  REFRESH_TOKEN = 'refresh_token',
}

export class TokenRequestDto {
  @ApiProperty({ enum: GrantType, example: GrantType.CLIENT_CREDENTIALS })
  @IsEnum(GrantType)
  grant_type: GrantType;

  // Required for client_credentials grant
  @ApiPropertyOptional({ example: 'merchant-001' })
  @ValidateIf((o) => o.grant_type === GrantType.CLIENT_CREDENTIALS)
  @IsString()
  @IsNotEmpty()
  client_id?: string;

  @ApiPropertyOptional({ example: 'sk_test_abc123' })
  @ValidateIf((o) => o.grant_type === GrantType.CLIENT_CREDENTIALS)
  @IsString()
  @IsNotEmpty()
  client_secret?: string;

  // Required for password grant
  @ApiPropertyOptional({ example: 'admin@merchant.com' })
  @ValidateIf((o) => o.grant_type === GrantType.PASSWORD)
  @IsString()
  @IsNotEmpty()
  username?: string;

  @ApiPropertyOptional({ example: 'secret' })
  @ValidateIf((o) => o.grant_type === GrantType.PASSWORD)
  @IsString()
  @IsNotEmpty()
  password?: string;

  @ApiPropertyOptional({ example: 'merchant-001' })
  @ValidateIf((o) => o.grant_type === GrantType.PASSWORD)
  @IsString()
  @IsNotEmpty()
  merchant_id?: string;

  // Required for refresh_token grant
  @ApiPropertyOptional({ example: 'rt_eyJhbGciOiJSUzI1NiJ9...' })
  @ValidateIf((o) => o.grant_type === GrantType.REFRESH_TOKEN)
  @IsString()
  @IsNotEmpty()
  refresh_token?: string;
}

export class RefreshTokenRequestDto {
  @ApiProperty({ example: 'rt_eyJhbGciOiJSUzI1NiJ9...' })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

export class RevokeTokenRequestDto {
  @ApiProperty({ example: 'rt_eyJhbGciOiJSUzI1NiJ9...' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({ enum: ['refresh_token', 'access_token'], example: 'refresh_token' })
  @IsOptional()
  @IsString()
  token_type_hint?: 'refresh_token' | 'access_token';
}

export class IntrospectTokenRequestDto {
  @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiJ9...' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({ enum: ['access_token', 'refresh_token'], example: 'access_token' })
  @IsOptional()
  @IsString()
  token_type_hint?: 'access_token' | 'refresh_token';
}
