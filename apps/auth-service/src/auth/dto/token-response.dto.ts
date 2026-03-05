export class TokenResponseDto {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export class IntrospectResponseDto {
  active: boolean;
  sub?: string;
  merchant_id?: string;
  role?: string;
  permissions?: string[];
  client_id?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  jti?: string;
}
