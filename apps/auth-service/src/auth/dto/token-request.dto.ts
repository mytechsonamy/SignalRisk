import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum GrantType {
  CLIENT_CREDENTIALS = 'client_credentials',
}

export class TokenRequestDto {
  @IsEnum(GrantType)
  grant_type: GrantType;

  @IsString()
  @IsNotEmpty()
  client_id: string;

  @IsString()
  @IsNotEmpty()
  client_secret: string;
}
