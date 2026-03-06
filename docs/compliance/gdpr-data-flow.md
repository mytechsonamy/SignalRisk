# GDPR Article 30 Record of Processing Activities — SignalRisk

**Version:** 1.0 | **Date:** 2026-03-06 | **DPO:** dpo@signalrisk.io

## Processing Activity: Fraud Detection and Risk Scoring

### Controller / Processor Relationship

- **Data Controller:** SignalRisk merchant customers (they determine purposes)
- **Data Processor:** SignalRisk (processes on behalf of merchants)
- **Sub-processors:** AWS (infrastructure), Datadog (observability — roadmap)

### Data Subjects

End-users (consumers) making transactions on SignalRisk merchant customer platforms.

### Categories of Personal Data

| Data Element | Classification | Pseudonymous? | Retention | Legal Basis |
|--------------|---------------|---------------|-----------|-------------|
| IP address | Personal data | No | 365 days (cases table) | Art. 6(1)(f) |
| Device fingerprint | Pseudonymous identifier | Yes (djb2 hash) | 730 days (devices table) | Art. 6(1)(f) |
| Behavioral patterns | Derived / pseudonymous | Yes | 365 days | Art. 6(1)(f) |
| Session ID | Pseudonymous identifier | Yes | Session duration | Art. 6(1)(f) |
| User-Agent string | Personal data | No | 365 days | Art. 6(1)(f) |
| Screen resolution | Technical metadata | Yes | 730 days | Art. 6(1)(f) |

### Legal Basis

**Art. 6(1)(f) Legitimate Interest** — Fraud prevention is a legitimate interest of both
merchants (protecting revenue) and data subjects themselves (protecting against fraudulent
transactions on their accounts). Legitimate Interest Assessment (LIA) on file.

### Data Subject Rights Implementation

| Right | Article | Implementation | Endpoint |
|-------|---------|----------------|----------|
| Right to erasure | Art. 17 | `PurgeService` cascades soft-delete + revoke | `POST /v1/merchants/:id/purge` |
| Right to restriction | Art. 18 | Soft-delete via `deleted_at` column | Migration 007 |
| Data minimization | Art. 5(1)(c) | Only behavioral/device signals; no PANs or full PII | Schema review |
| Right to access | Art. 15 | Data export endpoint | Roadmap Sprint 12 |

### Retention Policy

| Data Category | Retention Period | Enforcement | Reference |
|---------------|-----------------|-------------|-----------|
| Cases | 365 days from resolution | `DataRetentionService` @Cron 2am | `apps/case-service/src/retention/` |
| Devices | 730 days from `lastSeenAt` | `DeviceRetentionService` @Cron 3am | `apps/device-intel-service/src/retention/` |
| Audit logs | 2555 days (7 years) | Manual DBA job (regulatory requirement) | `audit_log` table |
| Session data | Session duration | In-memory only | `packages/web-sdk/` |

### International Transfers

| Transfer | Destination | Mechanism |
|----------|------------|-----------|
| Primary data | AWS us-east-1 (Virginia, USA) | AWS DPA + SCCs (EU Commission Decision 2021/914) |
| DR replica | AWS eu-west-1 (Ireland, EU) | Within EU — no transfer restriction |

### Data Flow Diagram (textual)

```
End-user browser
     |
     | (behavioral signals, device fingerprint)
     v
packages/web-sdk ──POST /v1/events──> event-collector (port 3000)
                                            |
                                            | Kafka: events topic
                                            v
                            device-intel-service (port 3003)
                            velocity-service    (port 3004)
                            behavioral-service  (port 3005)
                                            |
                                            | Kafka: signals topic
                                            v
                              decision-service (port 3002)
                                            |
                                    risk score + action
                                            |
                              case-service (port 3010) -- stored in PostgreSQL (RLS)
                              webhook-service (port 3011) -- notifies merchant
```

All PostgreSQL tables enforce `app.merchant_id` RLS — no cross-tenant data access.
