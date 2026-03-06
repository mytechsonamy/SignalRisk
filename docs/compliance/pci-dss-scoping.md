# PCI-DSS v4.0 Scoping Document — SignalRisk

**Version:** 1.0 | **Date:** 2026-03-06 | **Next Review:** 2026-09-06

## Executive Summary

SignalRisk is a fraud detection platform. It processes behavioral signals, device fingerprints,
and velocity data to produce risk scores. Primary Account Numbers (PANs) and cardholder data
never flow through SignalRisk infrastructure.

## SAQ Determination

**SAQ Type: SAQ A-EP**

Rationale: SignalRisk's JavaScript web-sdk (`packages/web-sdk/`) is embedded on merchant checkout
pages that handle card data. The SDK collects behavioral signals only — no card data. SignalRisk
itself is out of scope for PAN storage or processing.

## Requirement-by-Requirement Mapping

| Req | Title | Status | Implementation | Evidence |
|-----|-------|--------|----------------|----------|
| 1 | Network security controls | Implemented | K8s NetworkPolicy manifests | `infrastructure/k8s/` |
| 2 | Secure configurations | Implemented | No default credentials; secrets via K8s Secrets | `infrastructure/k8s/` |
| 3 | Stored account data | N/A | No PANs stored | — |
| 4 | Transmission security | Implemented | TLS 1.2+ enforced; HSTS via Helmet middleware | `apps/*/src/main.ts` |
| 5 | Malware protection | Implemented | Container image scanning in CI; npm audit | `.github/workflows/security.yml` |
| 6 | Secure development | Implemented | SAST via npm audit, Zod input validation, parameterized queries | `apps/*/src/**/*.repository.ts` |
| 7 | Access restriction | Implemented | RBAC (admin/analyst/viewer), AdminGuard, JWT claims | `apps/auth-service/src/auth/` |
| 8 | Authentication | Implemented | RS256 JWT 24h expiry, key rotation (25h overlap), bcrypt API keys | `apps/auth-service/src/auth/key-rotation.service.ts` |
| 9 | Physical security | Inherited | AWS responsibility (cloud-hosted) | AWS Shared Responsibility Model |
| 10 | Logging and monitoring | Implemented | Audit log table, OTel traces (Jaeger), request logging | `infrastructure/observability/jaeger.yaml` |
| 11 | Security testing | Implemented | k6 load tests, smoke tests (testcontainers), GitHub Actions weekly audit | `tests/load/`, `tests/smoke/` |
| 12 | Security policy | Partial | This document; security controls matrix | `docs/compliance/` |

## Gap Analysis

| Requirement | Status | Gap | Remediation | Priority |
|-------------|--------|-----|-------------|----------|
| Req 3 | N/A | No PANs | — | — |
| Req 9 | Inherited | Physical security (AWS) | Maintain AWS BAA | Low |
| Req 12.3 | Partial | Formal information security policy handbook | Create policy handbook | Medium |
| Req 12.10 | Partial | Formal incident response plan | Integrate with DR runbook | Medium |

## Scope Reduction Evidence

- `packages/web-sdk/`: collects `screenResolution`, `gpuRenderer`, `timezone`, `language`, `webglHash`, `canvasHash`, `platform` — zero card data fields
- No database tables for PANs, CVVs, or magnetic stripe data
- All payment processing delegated to PCI-DSS Level 1 certified processors (Stripe, Adyen)
