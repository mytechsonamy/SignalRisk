# SignalRisk Data Model Reference

Version: 1.0.0
Date: 2026-03-13

This document is the single source of truth for SignalRisk's data model: database schema, Kafka topics, event payloads, signal contracts, and API response shapes. Code-level paths are in `CLAUDE.md` §4.

---

## 1. Database Overview

- **Engine**: PostgreSQL 16, RLS-enabled multi-tenant
- **Partitioning**: `events` table partitioned monthly (2026-01 — 2026-12 + default)
- **RLS mechanism**: All tenant-scoped tables enforce `current_setting('app.merchant_id')`
- **Migrations**: 15 versioned files tracked in `schema_migrations` (001 — 015)
- **Source**: `database/migrations/` + `packages/db-migrations/`

---

## 2. Core Tables

### merchants

Root tenant table. NOT RLS-scoped.

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK, default uuid_generate_v4() |
| name | TEXT | NOT NULL |
| api_key_prefix | VARCHAR(12) | NOT NULL, UNIQUE |
| status | ENUM | ACTIVE, SUSPENDED, ONBOARDING (default ONBOARDING) |
| settings | JSONB | default '{}' — risk thresholds, webhook URLs, feature flags |
| created_at | TIMESTAMPTZ | default now() |
| updated_at | TIMESTAMPTZ | trigger-managed |

### users

Dashboard users. RLS-scoped.

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| merchant_id | UUID | FK merchants(id) CASCADE |
| email | TEXT | NOT NULL, globally unique (migration 015) |
| password_hash | TEXT | NOT NULL (bcrypt) |
| role | ENUM | ADMIN, SENIOR_ANALYST, ANALYST, VIEWER (default ANALYST) |
| mfa_secret | TEXT | nullable (future TOTP) |
| created_at | TIMESTAMPTZ | default now() |

### devices

End-user device fingerprints. RLS-scoped.

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| merchant_id | UUID | FK merchants(id) CASCADE |
| fingerprint | TEXT | NOT NULL, unique per merchant |
| fingerprint_prefix | VARCHAR(8) | NOT NULL |
| trust_score | NUMERIC(5,2) | default 50.00 (0-100) |
| is_emulator | BOOLEAN | default false |
| attributes | JSONB | default '{}' — screen, timezone, fonts, WebGL |
| first_seen_at | TIMESTAMPTZ | default now() |
| last_seen_at | TIMESTAMPTZ | updated on each event |

### events

Raw behavioral events. RLS-scoped. **Partitioned monthly by created_at.**

| Column | Type | Constraints |
|---|---|---|
| id | UUID | NOT NULL |
| merchant_id | UUID | NOT NULL |
| device_id | UUID | FK devices(id) CASCADE |
| session_id | UUID | NOT NULL |
| type | ENUM | PAGE_VIEW, CLICK, FORM_SUBMIT, LOGIN, SIGNUP, PAYMENT, CUSTOM |
| payload | JSONB | default '{}' |
| created_at | TIMESTAMPTZ | partition key |

PK: (id, created_at) — composite for partitioning.

### decisions

Fraud scoring decisions. RLS-scoped.

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| merchant_id | UUID | FK merchants(id) CASCADE |
| request_id | UUID | NOT NULL, unique per merchant |
| device_id | UUID | FK devices(id) CASCADE |
| entity_id | TEXT | nullable (migration 013) |
| entity_type | TEXT | CHECK IN customer, device, ip (migration 013) |
| risk_score | NUMERIC(5,2) | 0-100 |
| decision | ENUM | ALLOW, REVIEW, BLOCK |
| risk_factors | JSONB | default '[]' |
| signals | JSONB | default '{}' — raw signal snapshot |
| latency_ms | INTEGER | end-to-end scoring latency |
| is_test | BOOLEAN | default false (migration 005) |
| created_at | TIMESTAMPTZ | default now() |

### cases

Fraud investigation cases. RLS-scoped.

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| merchant_id | UUID | NOT NULL |
| decision_id | UUID | NOT NULL |
| entity_id | UUID | NOT NULL |
| entity_type | TEXT | CHECK IN customer, device, ip (migration 015) |
| action | TEXT | CHECK IN REVIEW, BLOCK |
| risk_score | NUMERIC(5,2) | default 0 |
| risk_factors | JSONB | default '[]' |
| status | TEXT | OPEN, IN_REVIEW, RESOLVED, ESCALATED (default OPEN) |
| priority | TEXT | HIGH, MEDIUM, LOW (default LOW) |
| sla_deadline | TIMESTAMPTZ | BLOCK=4h, REVIEW=24h |
| sla_breached | BOOLEAN | default false |
| assigned_to | TEXT | nullable |
| resolution | TEXT | CHECK IN FRAUD, LEGITIMATE, INCONCLUSIVE |
| resolution_notes | TEXT | nullable |
| resolved_at | TIMESTAMPTZ | nullable |
| created_at | TIMESTAMPTZ | default now() |
| updated_at | TIMESTAMPTZ | default now() |

---

## 3. Stateful Fraud Tables

### entity_profiles (migration 008)

Durable entity risk memory. RLS-scoped. Auto-updated on each decision (fire-and-forget).

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| merchant_id | TEXT | tenant |
| entity_type | TEXT | customer, device, ip |
| entity_id | TEXT | |
| first_seen_at | TIMESTAMPTZ | |
| last_seen_at | TIMESTAMPTZ | |
| total_tx_count | INTEGER | cumulative |
| total_block_count | INTEGER | |
| total_review_count | INTEGER | |
| total_allow_count | INTEGER | |
| risk_score_avg | NUMERIC(5,2) | running average |
| is_watchlisted | BOOLEAN | |
| is_fraud_confirmed | BOOLEAN | set by feedback consumer |
| watchlist_reason | TEXT | |
| metadata | JSONB | |

Unique: (merchant_id, entity_type, entity_id)

### decision_feature_snapshots (migration 009)

ML-ready feature storage. RLS-scoped. Written alongside each decision.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| decision_id | UUID | FK decisions |
| merchant_id | TEXT | tenant |
| entity_id | TEXT | |
| entity_type | TEXT | default 'customer' |
| decision | TEXT | ALLOW, REVIEW, BLOCK |
| risk_score | NUMERIC(5,2) | |
| **Structured f_ columns** | | See below |
| signals_raw | JSONB | full raw signals |
| created_at | TIMESTAMPTZ | |

Structured feature columns (f_ prefix):

```
f_device_trust_score, f_device_is_emulator, f_device_days_since_first
f_velocity_tx_count_10m, f_velocity_tx_count_1h, f_velocity_tx_count_24h
f_velocity_amount_sum_1h, f_velocity_amount_sum_24h
f_velocity_unique_devices, f_velocity_unique_ips, f_velocity_burst_detected
f_behavioral_risk_score, f_behavioral_is_bot, f_behavioral_bot_prob
f_network_risk_score, f_network_is_proxy, f_network_is_vpn, f_network_is_tor, f_network_geo_mismatch
f_telco_prepaid_prob, f_telco_is_ported
f_stateful_prev_block_30d, f_stateful_prev_review_7d
```

### analyst_labels (migration 010)

Entity-level labels from case resolutions. RLS-scoped.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| merchant_id | TEXT | |
| entity_type | TEXT | customer, device, ip |
| entity_id | TEXT | |
| case_id | UUID | FK cases |
| label | TEXT | FRAUD, LEGITIMATE, INCONCLUSIVE |
| analyst_id | TEXT | nullable |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | |

### watchlist_entries (migration 011)

Denylist / allowlist / watchlist per entity. RLS-scoped.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| merchant_id | TEXT | |
| entity_type | TEXT | customer, device, ip |
| entity_id | TEXT | |
| list_type | TEXT | denylist, allowlist, watchlist |
| reason | TEXT | |
| source | TEXT | manual, auto_fraud, auto_legitimate, system |
| expires_at | TIMESTAMPTZ | NULL = permanent |
| is_active | BOOLEAN | soft delete |
| created_by | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Unique: (merchant_id, entity_type, entity_id, list_type)

Precedence at decision time: **denylist > watchlist > allowlist**

### feature_definitions (migration 012)

Feature governance registry. NOT RLS-scoped (global).

| Column | Type | Notes |
|---|---|---|
| feature_name | TEXT | e.g. stateful.customer.txCount10m |
| entity_type | TEXT | customer, device, ip, global |
| data_type | TEXT | counter, sum, hll, boolean, enum, score |
| window | TEXT | 10m, 1h, 24h, 30d (nullable) |
| source_service | TEXT | velocity-service, decision-service, etc. |
| redis_key_pattern | TEXT | |
| is_active | BOOLEAN | |

---

## 4. Support Tables

| Table | Purpose | RLS |
|---|---|---|
| outbox_events | Transactional outbox for Kafka | No |
| idempotency_requests | API request deduplication (24h TTL) | Yes |
| processed_events | Kafka consumer deduplication | No |
| refresh_tokens | JWT refresh token storage | Yes |
| schema_migrations | Migration version tracking | No |

---

## 5. Kafka Topics

Source: `packages/kafka-config/src/index.ts`

| Topic | Purpose | Key |
|---|---|---|
| signalrisk.events.raw | Raw incoming events | merchantId:eventId |
| signalrisk.events.dlq | Failed events (retry exhausted) | eventId |
| signalrisk.events.dlq.exhausted | Permanently failed events | eventId |
| signalrisk.events.unrouted | Routing failures | eventId |
| signalrisk.decisions | Fraud/legitimate verdicts | merchantId:requestId |
| signalrisk.cases | Case creation events | merchantId:caseId |
| signalrisk.webhooks | Webhook delivery tasks | merchantId:webhookId |
| signalrisk.rules.changes | Rule update broadcasts | ruleId |
| signalrisk.state.labels | Analyst labels (feedback loop) | merchantId:entityId |
| signalrisk.enrichment.telco | Async telco enrichment | msisdn |
| signalrisk.consent | GDPR/POPIA consent changes | merchantId:customerId |
| signalrisk.merchants | Merchant lifecycle events | merchantId |

Compression: gzip (KafkaJS, LZ4 not supported).

---

## 6. Signal Contracts

Source: `packages/signal-contracts/`

All signals fetched in parallel, 2000ms timeout. Timeout/error = null, decision continues.

| Signal | Service | Port | Weight | Key Fields |
|---|---|---|---|---|
| Device | device-intel-service | 3003 | 0.35 | trustScore (0-100), isEmulator, daysSinceFirstSeen |
| Velocity | velocity-service | 3004 | 0.25 | txCount10m/1h/24h, amountSum, burstDetected, uniqueDevices/IPs |
| Behavioral | behavioral-service | 3005 | 0.20 | sessionRiskScore, botProbability, isBot |
| Network | network-intel-service | 3006 | 0.15 | isProxy, isVpn, isTor, geoMismatchScore, riskScore |
| Telco | telco-intel-service | 3007 | 0.05 | prepaidProbability, isPorted, lineType |

Decision thresholds:
- riskScore >= 70 → BLOCK
- riskScore >= 40 → REVIEW
- riskScore < 40 → ALLOW

---

## 7. Enum Reference

| Domain | Values |
|---|---|
| Entity types | customer, device, ip |
| Decision outcomes | ALLOW, REVIEW, BLOCK |
| Case statuses | OPEN, IN_REVIEW, RESOLVED, ESCALATED |
| Resolutions | FRAUD, LEGITIMATE, INCONCLUSIVE |
| Watchlist types | denylist, allowlist, watchlist |
| Watchlist sources | manual, auto_fraud, auto_legitimate, system |
| User roles | ADMIN, SENIOR_ANALYST, ANALYST, VIEWER |
| Event types | PAGE_VIEW, CLICK, FORM_SUBMIT, LOGIN, SIGNUP, PAYMENT, CUSTOM |
| Payment methods | credit_card, debit_card, bank_transfer, wallet, crypto, other |
| Merchant statuses | ACTIVE, SUSPENDED, ONBOARDING |

---

## 8. Data Flow Summary

```
Client SDK                     SignalRisk Platform                    Merchant Backend
    |                                |                                     |
    |-- POST /v1/events ----------->|                                     |
    |   (API key auth)              |-- Kafka: events.raw                 |
    |                               |       |                             |
    |                               |   [decision-service]                |
    |                               |     fetch signals (5 services)      |
    |                               |     evaluate 21 DSL rules           |
    |                               |     check watchlist                 |
    |                               |     check prior-decision memory     |
    |                               |       |                             |
    |                               |-- Kafka: decisions                  |
    |                               |       |                             |
    |                               |   [case-service]                    |
    |                               |     REVIEW/BLOCK -> create case     |
    |                               |       |                             |
    |                               |   [webhook-service]                 |
    |                               |     sign + deliver ------------------>|
    |                               |       |                             |
    |   POST /v1/decisions -------->|   (returns cached decision)         |
    |   (JWT auth)                  |                                     |
    |                               |                                     |
    |   PATCH /v1/cases/{id} ------>|   resolve case -> label -> Kafka    |
    |   (JWT auth, analyst)         |     -> watchlist update             |
    |                               |     -> entity profile update        |
```
