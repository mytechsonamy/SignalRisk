# SignalRisk Data Model

> Canonical data model reference | Verified against migrations and service code | March 13, 2026

## 1. Purpose

This document describes the data model that backs SignalRisk today:

- tenant and operator identity
- event ingestion model
- fraud decision and case model
- stateful fraud memory
- feedback and watchlist state
- storage responsibilities across PostgreSQL, Redis, Kafka, and Neo4j

It is intended to answer two questions:

1. What are the core business entities in SignalRisk?
2. Where does each piece of data live, and why?

## 2. Modeling Principles

- `merchant` is the top-level tenant boundary.
- Raw events are immutable.
- Decisions are append-only and auditable.
- Stateful fraud uses typed entities: `customer`, `device`, `ip`.
- Hot state lives in Redis; durable state lives in PostgreSQL.
- Cross-service propagation happens through Kafka.
- Tenant isolation is enforced primarily with PostgreSQL RLS plus tenant-aware service logic.

## 3. Core Concepts

| Concept | Meaning | Canonical ID |
|---|---|---|
| Merchant | A customer company integrated with SignalRisk | `merchants.id` |
| Operator user | Dashboard/admin user under a merchant | `users.id` |
| API client | Machine credential pair for OAuth client credentials | `merchants.client_id` |
| SDK API key | Event ingestion secret for `event-collector` | `sk_test_<32hex>` |
| Event | Raw merchant activity sent for fraud analysis | `eventId` / `requestId` |
| Device | Browser/mobile fingerprinted subject | `deviceId` |
| Entity | Fraud-tracked subject in typed model | `entityType + entityId` |
| Decision | ALLOW / REVIEW / BLOCK result | `decisions.id` + `request_id` |
| Case | Analyst workflow object for REVIEW/BLOCK | `cases.id` |
| Analyst label | FRAUD / LEGITIMATE / INCONCLUSIVE feedback | `analyst_labels.id` |
| Watchlist entry | denylist / allowlist / watchlist state | `watchlist_entries.id` |
| Entity profile | Durable state summary for one entity | `entity_profiles.id` |
| Feature snapshot | Structured feature row captured at decision time | `decision_feature_snapshots.id` |

## 4. Canonical Identity Model

### Merchant identity

- Database tenant key: `merchants.id` (UUID)
- Machine auth key: `client_id` + `client_secret`
- Dashboard scope: JWT claim `merchant_id`

### Operator identity

- `users.email` is globally unique
- each user still belongs to exactly one `merchant_id`
- dashboard login uses `POST /v1/auth/login`

### Entity identity

Stateful fraud uses explicit typed entities:

- `customer`
- `device`
- `ip`

Current rule:

- new paths should propagate `entityType` explicitly
- historical case backfill uses `entity_type='customer'` only for backward compatibility

## 5. PostgreSQL Model

## 5.1 Tenant and access tables

### `merchants`

Top-level tenant record.

Important fields:

- `id`
- `name`
- `api_key_prefix`
- `client_id`
- `client_secret_hash`
- `roles`
- `status`
- `is_active`
- `settings`

Used by:

- auth-service
- merchant onboarding
- OAuth `client_credentials`

### `users`

Dashboard and admin users under a merchant.

Important fields:

- `id`
- `merchant_id`
- `email`
- `password_hash`
- `role`
- `created_at`

Current behavior:

- password-based login is DB-backed
- admin can invite users and set passwords

### `refresh_tokens`

Hashed refresh tokens for operator and machine tokens.

Important fields:

- `id`
- `user_id`
- `merchant_id`
- `token_hash`
- `expires_at`
- `revoked_at`

## 5.2 Event and decision tables

### `events`

Immutable raw event store, range-partitioned by month on `created_at`.

Important fields:

- `id`
- `merchant_id`
- `device_id`
- `session_id`
- `type`
- `payload`
- `created_at`

Notes:

- request envelope comes from the merchant
- ingestion path is asynchronous via Kafka

### `devices`

Durable device registry keyed by merchant + fingerprint.

Important fields:

- `id`
- `merchant_id`
- `fingerprint`
- `trust_score`
- `is_emulator`
- `attributes`
- `first_seen_at`
- `last_seen_at`

### `decisions`

Audit record of every fraud decision.

Important fields:

- `id`
- `merchant_id`
- `request_id`
- `device_id`
- `entity_id`
- `entity_type`
- `risk_score`
- `decision`
- `risk_factors`
- `signals`
- `latency_ms`
- `is_test`
- `created_at`

Notes:

- `request_id` is unique per merchant
- `entity_id + entity_type` powers typed prior-decision memory
- this is the main audit source for downstream analysis

### `cases`

Analyst workflow object created for `REVIEW` and `BLOCK`.

Important fields:

- `id`
- `merchant_id`
- `decision_id`
- `entity_id`
- `entity_type`
- `action`
- `risk_score`
- `risk_factors`
- `status`
- `priority`
- `sla_deadline`
- `resolution`
- `resolved_at`

Notes:

- `entity_type` was added later and backfilled with `customer` for historical rows

## 5.3 Stateful fraud tables

### `entity_profiles`

Durable memory per typed entity.

Important fields:

- `merchant_id`
- `entity_type`
- `entity_id`
- `first_seen_at`
- `last_seen_at`
- `total_tx_count`
- `total_block_count`
- `total_review_count`
- `total_allow_count`
- `risk_score_avg`
- `is_watchlisted`
- `watchlist_reason`
- `metadata`

Used for:

- durable entity history
- closed-loop fraud memory
- future analyst/entity profile views

### `decision_feature_snapshots`

Structured feature export table for analytics and ML readiness.

Important fields:

- `decision_id`
- `merchant_id`
- `entity_id`
- `entity_type`
- `decision`
- `risk_score`
- `f_*` feature columns
- `signals_raw`

Used for:

- training/export datasets
- decision debugging
- feature provenance

### `analyst_labels`

Durable record of analyst outcomes.

Important fields:

- `merchant_id`
- `entity_type`
- `entity_id`
- `case_id`
- `label`
- `analyst_id`
- `notes`

### `watchlist_entries`

Decision-time feedback state.

Important fields:

- `merchant_id`
- `entity_type`
- `entity_id`
- `list_type` = `denylist | allowlist | watchlist`
- `reason`
- `source`
- `expires_at`
- `is_active`

Precedence rule:

- `denylist > watchlist > allowlist`

Decision-time effect:

- denylist: short-circuit `BLOCK`
- watchlist: `+20` score boost
- allowlist: `-15` suppression only, never full bypass

## 5.4 Reliability and support tables

### `idempotency_requests`

Stores decision API responses for safe retries.

### `processed_events`

Consumer deduplication by `event_id + consumer_group`.

### `outbox_events`

Transactional outbox rows for reliable asynchronous publish.

### `schema_migrations`

Migration tracking for post-bootstrap schema evolution.

## 6. Storage Responsibility by Technology

## PostgreSQL

Use for:

- tenant data
- users and credentials metadata
- durable fraud audit trail
- cases and analyst workflow
- watchlists and labels
- structured feature snapshots

## Redis

Use for:

- decision cache
- typed velocity counters
- sequence buffers
- webhook config storage
- JWT denylist
- rate limits

Current note:

- webhook configuration is stored in Redis, not PostgreSQL
- this is operationally simple, but less durable than the main relational model

## Kafka

Use for:

- event ingestion backbone
- decision fan-out
- analyst feedback propagation

Canonical topics in current flow:

- `signalrisk.events.raw`
- `signalrisk.decisions`
- `signalrisk.state.labels`

## Neo4j

Use for:

- graph intelligence
- device/IP/account linking
- fraud ring enrichment

## 7. End-to-End Relationship View

```text
merchant
  -> users
  -> events
  -> devices
  -> decisions
  -> cases
  -> analyst_labels
  -> watchlist_entries
  -> entity_profiles
  -> decision_feature_snapshots

decision
  -> may create case
  -> may emit webhook
  -> updates entity_profile
  -> writes feature_snapshot

case resolution
  -> publishes analyst label
  -> updates watchlist state
  -> affects next decision for same typed entity
```

## 8. Canonical Event and Decision Shapes

## Event envelope

Required fields:

- `merchantId`
- `deviceId`
- `sessionId`
- `type`
- `payload`

Optional but strongly recommended:

- `eventId`
- `timestamp`
- `ipAddress`
- `userAgent`
- `pageUrl`
- `referrer`

## Decision output

Core fields:

- `requestId`
- `merchantId`
- `action`
- `riskScore`
- `riskFactors`
- `appliedRules`
- `latencyMs`
- `createdAt`

Downstream side effects:

- Kafka publish to `signalrisk.decisions`
- optional case creation
- optional webhook
- state update and feature snapshot write

## 9. Tenant Isolation Model

Tenant-scoped PostgreSQL tables use RLS with:

```sql
set_config('app.merchant_id', $merchantId, true)
```

Applied to stateful and workflow tables such as:

- `refresh_tokens`
- `cases`
- `entity_profiles`
- `decision_feature_snapshots`
- `analyst_labels`
- `watchlist_entries`

## 10. Known Modeling Constraints

- raw event DTOs still use string identifiers from the integration layer, while some older relational tables originated with UUID-heavy assumptions
- `entity_type='customer'` still appears as a historical compatibility default on older case flows
- webhook configuration is Redis-backed rather than relational
- some product docs still describe the model at Sprint 39 level and should be kept aligned with this document

## 11. Related Documents

- [System Overview](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/architecture/system-overview.md)
- [Comprehensive Architecture](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/architecture/comprehensive-architecture.md)
- [Technical Documentation](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/TECHNICAL.md)
- [Merchant Integration Guide](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/product/merchant-integration-guide.md)
