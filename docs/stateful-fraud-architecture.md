# SignalRisk Stateful Fraud Architecture

> Version 1.0 | Date: 11 March 2026

## 1. Purpose

This document turns the stateful fraud scope into a concrete technical architecture.

It answers:

- which state should exist
- where each type of state should live
- how state is updated
- how decision-service should consume state
- how to keep state tenant-safe, recoverable, and auditable

## 2. Architectural Goals

The state layer must be:

- low latency for online decisioning
- durable enough for recovery and audit
- tenant-scoped by default
- replay-safe and idempotent
- incrementally adoptable on top of the current platform

## 3. State Classes

There are four distinct state classes.

### 3.1 Hot online state

Used directly during live decisioning.

Examples:

- `customer.tx_count_10m`
- `device.distinct_accounts_24h`
- `ip.failed_login_count_30m`
- recent sequence markers

Store:

- Redis

### 3.2 Durable operational state

Used for audit, analyst workflows, recovery, and historical memory.

Examples:

- last 30 day decision summary
- previous fraud confirmation
- watchlist status
- case outcomes

Store:

- PostgreSQL

### 3.3 Event propagation state

Used to fan out updates and recompute asynchronously.

Examples:

- event accepted
- feature updated
- analyst label applied
- graph edge added

Store:

- Kafka

### 3.4 Connected-entity state

Used for shared-resource and fraud-ring reasoning.

Examples:

- device shared by N accounts
- account linked to prior fraud cluster
- IP shared across merchants

Store:

- Neo4j

## 4. Proposed Runtime Flow

### 4.1 Online decision flow

1. `event-collector` accepts event.
2. Event published to `signalrisk.events.raw`.
3. `decision-service` consumes event.
4. `decision-service` fetches:
   - stateless signals from device/network/telco/behavioral/velocity services
   - hot entity state from Redis
   - optional durable memory summary from PostgreSQL
   - optional graph-derived features from graph-intel-service
5. `rule-engine-service` evaluates stateless + stateful context.
6. `decision-service` returns ALLOW / REVIEW / BLOCK.
7. Decision result is persisted.
8. State update event is published for asynchronous materialization.

### 4.2 Asynchronous state update flow

1. `decision-service` publishes `signalrisk.state.entity-updates`.
2. `state-materializer` or equivalent worker updates:
   - Redis counters
   - PostgreSQL entity snapshots
   - graph edges if needed
3. `case-service` and analyst labels publish feedback events.
4. feedback worker updates watchlists, risk memory, and feature snapshots.

## 5. Service Responsibilities

## 5.1 decision-service

Responsibilities:

- orchestrate all reads needed for live decisioning
- compose stateful feature context
- enforce latency budget
- degrade safely when one state source is unavailable

Must not:

- own long-term feature materialization logic
- directly contain heavy graph traversal logic

## 5.2 velocity-service

Responsibilities:

- sliding window counters
- entity frequency tracking
- repeat event counters
- burst and rate anomaly features

Should evolve into:

- general online temporal feature service

## 5.3 rule-engine-service

Responsibilities:

- evaluate stateful and stateless rule context
- support sequence markers
- support cumulative and prior-outcome features

## 5.4 case-service

Responsibilities:

- persist analyst feedback
- publish fraud-confirmed / false-positive labels
- expose entity history for analysts

## 5.5 graph-intel-service

Responsibilities:

- maintain relationship graph
- calculate graph-derived online features
- produce ring and linkage scores

## 5.6 New recommended service: `state-service`

If scope grows, introduce a dedicated service for:

- online feature reads
- durable entity profile reads
- feature definition registry
- state snapshot APIs

This avoids pushing too much state logic into `decision-service`.

## 6. Storage Design

## 6.1 Redis design

Redis should hold:

- counters
- sequence buffers
- hot risk memory
- cooldown flags
- recent distinct sets or approximations

### Recommended Redis key patterns

> **NOT (ADR-009):** Mevcut velocity-service `{merchantId}:vel:` prefix convention'ini kullaniyor.
> Yeni stateful key'ler de bu convention'a uyar: `{merchantId}:vel:{dim}:{entityType}:{entityId}`
> Asagidaki oneriler referans olarak kalir, uygulama sirasi `source-of-truth.md#stateful-namespace`'dedir.

#### Counter keys

- `{merchantId}:vel:{dim}:{entityType}:{entityId}`

Examples:

- `{merchantId}:vel:tx:customer:c123` (tx count — sorted set, window'a gore ZRANGEBYSCORE)
- `{merchantId}:vel:tx:device:d456` (device tx count)
- `{merchantId}:vel:fail:ip:1.2.3.4` (failed logins)

#### Amount aggregate keys

- `{merchantId}:vel:amt:{entityType}:{entityId}`

Examples:

- `{merchantId}:vel:amt:customer:c123` (amount sum — sorted set)

#### Sequence keys

- `{merchantId}:vel:seq:{entityType}:{entityId}`

Payload idea:

- recent event types
- timestamps
- last device change marker
- last payment attempt marker

#### Risk memory keys

- `{merchantId}:vel:prior:{entityType}:{entityId}`

Payload idea:

- prior review count
- prior block count
- last fraud-confirmed label timestamp
- cooldown until

### Redis data structures

Recommended choices:

- strings for simple counters
- hashes for compact per-entity state
- sorted sets for time-bucketed event windows
- HyperLogLog where exact distinct count is not required

## 6.2 PostgreSQL design

PostgreSQL should hold durable, queryable, audit-safe state.

### Recommended tables

#### `entity_profiles`

Purpose:

- current durable profile per entity

Columns:

- `id`
- `merchant_id`
- `entity_type`
- `entity_id`
- `first_seen_at`
- `last_seen_at`
- `current_risk_memory_score`
- `analyst_fraud_confirmed`
- `analyst_false_positive_count`
- `watchlist_status`
- `metadata`
- `updated_at`

#### `entity_state_snapshots`

Purpose:

- periodic or event-driven snapshots of calculated state

Columns:

- `id`
- `merchant_id`
- `entity_type`
- `entity_id`
- `snapshot_type`
- `state_json`
- `source_event_id`
- `created_at`

#### `decision_feature_snapshots`

Purpose:

- exact feature vector used during a decision

Columns:

- `id`
- `merchant_id`
- `request_id`
- `entity_type`
- `entity_id`
- `features_json`
- `feature_version`
- `created_at`

#### `analyst_labels`

Purpose:

- human fraud labels

Columns:

- `id`
- `merchant_id`
- `entity_type`
- `entity_id`
- `label`
- `reason`
- `source_case_id`
- `created_by`
- `created_at`

#### `watchlist_entries`

Purpose:

- explicit allow/deny/watch state

Columns:

- `id`
- `merchant_id`
- `entity_type`
- `entity_id`
- `list_type`
- `reason`
- `expires_at`
- `created_by`
- `created_at`

## 6.3 Kafka design

Recommended additional topics:

- `signalrisk.state.feature-updates`
- `signalrisk.state.entity-updates`
- `signalrisk.state.labels`
- `signalrisk.state.graph-updates`

### Topic purposes

#### `signalrisk.state.feature-updates`

Use for:

- emitting incremental changes to counters or derived features

#### `signalrisk.state.entity-updates`

Use for:

- new decision outcome affecting entity memory
- risk memory changes
- snapshot refresh requests

#### `signalrisk.state.labels`

Use for:

- analyst-confirmed fraud
- false positive
- inconclusive

#### `signalrisk.state.graph-updates`

Use for:

- new graph edges from events or decisions
- fraud cluster score refresh requests

## 6.4 Neo4j design

Recommended node types:

- `Customer`
- `Device`
- `IP`
- `Phone`
- `Merchant`
- `PaymentInstrument`

Recommended edge types:

- `USED_DEVICE`
- `USED_IP`
- `USED_PAYMENT_INSTRUMENT`
- `LINKED_PHONE`
- `SEEN_WITH`
- `FLAGGED_AS_FRAUD`

Recommended online graph features:

- `device_shared_accounts_7d`
- `ip_shared_accounts_24h`
- `linked_fraud_count_2hop`
- `cluster_risk_score`

## 7. State Update Strategy

## 7.1 Event-time update

Use when:

- a new event arrives
- counters need immediate adjustment

Examples:

- increment tx count
- increment login count
- add recent event to sequence buffer

## 7.2 Decision-time update

Use when:

- a decision is produced
- prior review/block memory must change

Examples:

- increment `previous_review_count`
- increment `previous_block_count`
- set `last_block_at`

## 7.3 Analyst-feedback update

Use when:

- an analyst marks fraud or false positive

Examples:

- set `confirmed_fraud=true`
- add denylist entry
- lower trust for linked device/IP

### Analyst Feedback Etki Politikasi (ADR-012)

| Resolution | Etki |
|---|---|
| `FRAUD` (confirmed) | Entity denylist'e eklenir + `stateful.customer.previousFraudCount` artirilir + linked device/IP'ye risk bonus (+20) |
| `LEGITIMATE` (false positive) | Risk suppression: entity'nin sonraki 7 gun icinde ayni rule'dan REVIEW almasi engellenir (cooldown) |
| `INCONCLUSIVE` | Hicbir state degisimi yok. Sadece case kapanir. |

Bu politika Sprint 6'da implemente edilir. Detay: `docs/claude/decision-log.md` ADR-012.

## 8. Stateful Feature Evaluation Model

Each decision should evaluate features in four layers:

1. request-local features
2. hot temporal features
3. durable historical features
4. graph-derived relational features

Example decision context:

```json
{
  "request": {
    "amount": 950,
    "currency": "TRY",
    "eventType": "PAYMENT"
  },
  "stateful": {
    "customer": {
      "txCount10m": 4,
      "txCount24h": 11,
      "amountSum24h": 4100,
      "previousBlockCount30d": 1
    },
    "device": {
      "distinctAccounts7d": 3
    },
    "ip": {
      "signupCount1h": 9
    }
  },
  "graph": {
    "linkedFraudCount2hop": 2,
    "clusterRiskScore": 0.81
  }
}
```

## 9. Sequence Detection Design

Sequence detection should begin lightweight.

### MVP approach

Use Redis sequence buffers and derived booleans.

Examples:

- `login_then_payment_15m`
- `failed_payment_x3_then_success_10m`
- `device_change_then_payment_30m`

### Later approach

Introduce a dedicated sequence engine or CEP-like evaluator if rule complexity grows.

## 10. Consistency and Recovery

State must tolerate crashes and replay.

Requirements:

- idempotent consumers
- replay-safe updates using event IDs
- durable recovery from PostgreSQL
- Redis rebuild path for hot state after flush or outage

Recommended pattern:

- Redis as serving cache
- PostgreSQL as durable authority for critical memory
- Kafka replay for state rebuild workflows

## 11. Tenant Isolation

All state keys, rows, and graph queries must remain merchant-scoped unless a deliberately approved cross-merchant feature exists.

Requirements:

- Redis keys include merchant ID
- PostgreSQL tables use RLS where appropriate
- Kafka payloads include merchant ID
- graph queries include merchant boundary logic

Cross-merchant logic, if later introduced, must be:

- explicit
- legally reviewed
- isolated from default merchant-scoped behavior

## 12. Failure Modes and Safe Degradation

### Redis unavailable

Expected behavior:

- use durable fallback where possible
- mark some stateful features unavailable
- renormalize scoring or fail closed for high-risk flows depending on policy

### PostgreSQL slow

Expected behavior:

- avoid synchronous heavy historical joins in hot path
- rely on precomputed or cached summaries

### Kafka lagging

Expected behavior:

- online state may become stale
- freshness metadata should indicate risk

### Neo4j unavailable

Expected behavior:

- graph features become null
- decision continues with reduced confidence

## 13. Observability Requirements

Must expose:

- state fetch latency by store
- feature freshness age
- state miss rate
- stale feature usage rate
- state update lag
- rebuild backlog
- label propagation lag

## 14. Security Requirements

State architecture must protect:

- sensitive entity identifiers
- analyst labels
- watchlist membership
- feature snapshot exports

Recommended controls:

- RLS for durable state tables
- hashed/tokenized identifiers where needed
- audit log on watchlist and label mutations
- restricted export permissions

## 15. MVP Implementation Blueprint

### Phase 1

- extend velocity-service to general temporal counters
- add Redis key patterns for customer/device/IP state
- add PostgreSQL `entity_profiles` and `decision_feature_snapshots`
- expose feature fetch interface to decision-service

### Phase 2

- add prior-decision memory
- add analyst labels and watchlist tables
- add stateful rule context to rule-engine

### Phase 3

- add graph-derived online features
- add snapshot rebuild jobs
- add feature versioning

## 16. Final Recommendation

Do not implement stateful fraud logic as scattered one-off counters.

Implement it as a deliberate architecture:

- Redis for hot online state
- PostgreSQL for durable state
- Kafka for propagation
- Neo4j for connected risk
- decision-service for orchestration
- rule-engine-service for evaluation

This gives SignalRisk a path from a fast scoring engine to a genuine production fraud intelligence platform.
