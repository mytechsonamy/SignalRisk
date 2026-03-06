# Security Controls Matrix — OWASP Top 10 2021

**Version:** 1.0 | **Date:** 2026-03-06 | **Next Review:** 2026-09-06

## Controls Mapping

| OWASP Category | Control | Implementation | Evidence File |
|----------------|---------|----------------|---------------|
| A01 Broken Access Control | RBAC, tenant isolation, AdminGuard | Role-based routing in dashboard; `AdminGuard` on admin endpoints; PostgreSQL RLS (`set_config('app.merchant_id', $1, true)`) | `apps/auth-service/src/auth/`, `apps/dashboard/src/` |
| A02 Cryptographic Failures | RS256 JWT, bcrypt, TLS, HSTS | `KeyRotationService` RSA-2048 with 25h overlap; bcrypt API keys; Helmet HSTS `maxAge: 31536000` | `apps/auth-service/src/auth/key-rotation.service.ts`, `apps/*/src/main.ts` |
| A03 Injection | Parameterized queries, Zod validation | All pg queries use `$1` placeholders; Zod DTOs validate all inbound data at controller layer | `apps/*/src/**/*.repository.ts`, `apps/*/src/**/*.dto.ts` |
| A04 Insecure Design | Threat model, rate limiting, fail-open | Abuse cases documented; `MerchantRateLimitService` (token bucket Lua); `IpRateLimitService` (100/min per IP); Redis errors fail-open | `docs/security/`, `apps/auth-service/src/rate-limit/`, `apps/event-collector/src/backpressure/` |
| A05 Security Misconfiguration | Helmet, CSP, HSTS, no defaults | Helmet middleware on all 4 NestJS services; CSP meta in dashboard; no default passwords; K8s Secrets for credentials | `apps/*/src/main.ts`, `apps/dashboard/index.html` |
| A06 Vulnerable Components | npm audit, weekly dependency scan | GitHub Actions `security.yml` runs `npm audit --audit-level=high` weekly across all packages | `.github/workflows/security.yml` |
| A07 Identification/Auth Failures | JWT expiry, rotation, refresh tokens | RS256 JWT 24h expiry; `KeyRotationService` 25h rotation window; refresh token table with revocation | `apps/auth-service/src/auth/` |
| A08 Software/Data Integrity | HMAC webhook signatures | `X-SignalRisk-Signature` HMAC-SHA256 on all webhook deliveries; verified by merchant SDK | `apps/webhook-service/src/webhook/webhook.service.ts` |
| A09 Security Logging Failures | Audit log, OTel traces, request logging | `audit_log` table (immutable); Jaeger distributed traces; NestJS request logging per service; `ApiKeyAuditService` | `infrastructure/observability/jaeger.yaml`, `apps/auth-service/src/merchants/api-key-audit.service.ts` |
| A10 SSRF | Fixed service hostnames, no user-controlled URLs | All inter-service calls use fixed K8s DNS names (e.g., `http://device-intel-service:3003`); no user-supplied URLs passed to internal HTTP clients | `apps/decision-service/src/decision/signal-fetchers.ts` |

## Additional Controls (Beyond OWASP Top 10)

| Control | Implementation | Reference |
|---------|----------------|-----------|
| Suspicious API key usage detection | `ApiKeyAuditService`: alert on >5 distinct IPs/1h | `apps/auth-service/src/merchants/api-key-audit.service.ts` |
| Backpressure / DoS resistance | `BackpressureGuard` 429 + `Retry-After`; queue depth monitoring | `apps/event-collector/src/backpressure/` |
| Data retention enforcement | Automated cron purge jobs; soft-delete columns | `apps/case-service/src/retention/`, `apps/device-intel-service/src/retention/` |
| WebSocket authentication | `WsJwtGuard` verifies JWT on handshake before any message received | `apps/decision-service/src/decision/decision.gateway.ts` |
| Feature flag kill switch | `FeatureFlagService` with `enabled=false` to disable features instantly | `apps/feature-flag-service/src/flags/` |
| Smoke testing | Testcontainers-based smoke tests for real Redis/PostgreSQL on every deploy | `tests/smoke/` |

## Control Effectiveness Assessment

| Tier | Controls | Maturity |
|------|----------|---------|
| Preventive | Parameterized queries, Zod, RBAC, JWT, rate limiting | High |
| Detective | Audit log, OTel traces, API key audit, suspicious IP | Medium |
| Corrective | Key rotation, API key revocation, PurgeService, kill switch flags | Medium |
| Recovery | DR runbook (RTO 15min, RPO 60s), PodDisruptionBudgets | Medium |
