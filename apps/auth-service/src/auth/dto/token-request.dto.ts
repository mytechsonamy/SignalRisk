import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export enum GrantType {
  CLIENT_CREDENTIALS = 'client_credentials',
  PASSWORD = 'password',
  REFRESH_TOKEN = 'refresh_token',
}

export class TokenRequestDto {
  @IsEnum(GrantType)
  grant_type: GrantType;

  // Required for client_credentials grant
  @ValidateIf((o) => o.grant_type === GrantType.CLIENT_CREDENTIALS)
  @IsString()
  @IsNotEmpty()
  client_id?: string;

  @ValidateIf((o) => o.grant_type === GrantType.CLIENT_CREDENTIALS)
  @IsString()
  @IsNotEmpty()
  client_secret?: string;

  // Required for password grant
  @ValidateIf((o) => o.grant_type === GrantType.PASSWORD)
  @IsString()
  @IsNotEmpty()
  username?: string;

  @ValidateIf((o) => o.grant_type === GrantType.PASSWORD)
  @IsString()
  @IsNotEmpty()
  password?: string;

  @ValidateIf((o) => o.grant_type === GrantType.PASSWORD)
  @IsString()
  @IsNotEmpty()
  merchant_id?: string;

  // Required for refresh_token grant
  @ValidateIf((o) => o.grant_type === GrantType.REFRESH_TOKEN)
  @IsString()
  @IsNotEmpty()
  refresh_token?: string;
}

export class RefreshTokenRequestDto {
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

export class RevokeTokenRequestDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsOptional()
  @IsString()
  token_type_hint?: 'refresh_token' | 'access_token';
}

export class IntrospectTokenRequestDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsOptional()
  @IsString()
  token_type_hint?: 'access_token' | 'refresh_token';
}
