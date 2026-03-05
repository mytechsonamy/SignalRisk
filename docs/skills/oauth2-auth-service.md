# Skill: oauth2-auth-service

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | BACKEND_NODE |
| **Category** | security |
| **Dependencies** | nestjs-service-creation, postgresql-rls-multi-tenant |

## Description
Authentication and authorization for SignalRisk: OAuth2 client_credentials for API access, session-based auth with MFA for dashboard, RBAC with 4 roles, and JWT validation with cached JWKS.

## Patterns
- API auth: OAuth2 client_credentials flow (merchant API keys -> JWT)
- Dashboard auth: Session-based with MFA (TOTP)
- RBAC: Admin, Senior Analyst, Analyst, Viewer roles
- JWT validation: Local validation with cached JWKS (no network call per request)
- Rate limiting: Per merchant, per endpoint (token bucket in Redis)
- API Gateway handles auth validation (not individual services)

## Architecture Reference
architecture-v3.md#1.3 (Auth: OAuth2 client_credentials)

## Code Examples
```typescript
// Auth service: token issuance
@Injectable()
export class AuthService {
  async issueToken(clientId: string, clientSecret: string): Promise<TokenResponse> {
    const merchant = await this.validateCredentials(clientId, clientSecret);
    const token = this.jwtService.sign({
      sub: merchant.id,
      merchant_id: merchant.id,
      scopes: merchant.scopes,
    }, { expiresIn: '1h' });
    return { access_token: token, token_type: 'Bearer', expires_in: 3600 };
  }
}

// RBAC guard
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<Role[]>('roles', context.getHandler());
    if (!requiredRoles) return true;
    const user = context.switchToHttp().getRequest().user;
    return requiredRoles.some(role => user.roles.includes(role));
  }
}

// Usage
@Controller('rules')
export class RuleController {
  @Post('approve')
  @Roles(Role.ADMIN, Role.SENIOR_ANALYST) // Only admin/senior can approve rules
  async approveRule(@Param('id') id: string) { ... }
}
```

## Constraints
- JWT validation MUST be local (cached JWKS) -- no network call per request (<5ms)
- MFA required for all dashboard users (TOTP, no SMS)
- Rate limiting enforced at API Gateway level (Redis token bucket)
- RBAC enforced on both API endpoints AND dashboard UI elements
- Never store plain-text secrets -- use bcrypt for client_secret, Vault for system secrets
- Session cookies: httpOnly, secure, sameSite=strict
