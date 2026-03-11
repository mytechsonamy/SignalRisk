# SignalRisk Stateful Fraud Detection Scope

> Version 1.0 | Date: 11 March 2026

## 1. Purpose

This document defines the additional product and technical scope required to make SignalRisk a true stateful fraud platform rather than a request-by-request scoring API.

It focuses on one core reality:

- fraud is rarely visible in a single transaction
- fraud is often visible across time, repetition, sequence, and connected entities

If the same customer, device, IP, MSISDN, or payment instrument performs similar actions multiple times in a day, the system must remember prior behavior and use that memory in new decisions.

## 2. Why Stateful Detection Is Required

The current platform already has some stateful building blocks:

- Redis-backed velocity counters
- decision cache
- PostgreSQL decision and case history
- graph intelligence
- Kafka event streams

However, these do not yet form a coherent stateful fraud layer.

A production fraud system must detect patterns such as:

- repeated transactions from the same customer in short windows
- multiple accounts sharing one device
- multiple devices converging on one account
- small low-risk probes followed by a larger attack
- rising cumulative amount over the day
- unusual sequence changes such as login -> device swap -> high-value payment
- prior fraud outcomes affecting future decisions

Without state management, the platform can score events, but it cannot reliably identify ongoing fraud campaigns, account farming, repeated abuse, or attack progression.

## 3. Scope Summary

This scope introduces six new capability areas:

1. Stateful feature platform
2. Entity timeline and behavior memory
3. Stateful rule and sequence detection
4. Cross-entity graph risk enrichment
5. Analyst feedback to entity risk state
6. ML-ready feature logging and training support

## 4. Core Concepts

### 4.1 Entity

Any object for which the system must maintain fraud memory.

Primary entities:

- customer/account
- device
- IP
- subnet / ASN
- session
- merchant
- payment instrument
- MSISDN / phone identity
- email / hashed email

### 4.2 State

State is the accumulated fraud-relevant memory for an entity or relationship.

Examples:

- transaction count in last 1 hour
- distinct accounts seen on same device in 7 days
- average amount per customer in 30 days
- last BLOCK decision timestamp
- fraud-confirmed flag from analyst review

### 4.3 Feature

A feature is a derived measurable value used in decisioning.

Examples:

- `customer.tx_count_1h`
- `customer.amount_sum_24h`
- `device.distinct_accounts_7d`
- `ip.signup_count_10m`
- `account.previous_block_count_30d`
- `merchant.block_rate_delta_24h`

### 4.4 Sequence

A sequence is an ordered set of events over time that carries fraud meaning.

Examples:

- `LOGIN -> PASSWORD_RESET -> PAYMENT`
- `SIGNUP -> DEVICE_CHANGE -> PAYMENT`
- `3 failed payments -> 1 successful payment`

## 5. Product Scope

### 5.1 Stateful Feature Platform

The platform must compute and serve online fraud features in real time.

Required capabilities:

- per-entity sliding window counters
- cumulative amount and velocity measures
- distinct-entity counters
- historical baseline features
- prior-decision memory
- feature freshness and staleness tracking

### 5.2 Entity Timeline and Memory

The platform must maintain a timeline view for every important entity.

Required capabilities:

- recent event history
- recent decision history
- recent case history
- first-seen / last-seen tracking
- repeated pattern markers
- cooldown and trust recovery logic

### 5.3 Stateful Rules and Sequences

The rule engine must evolve from purely stateless signal evaluation to mixed stateless/stateful policy evaluation.

Required capabilities:

- sequence-aware rules
- cumulative risk rules
- repeat-pattern rules
- prior-fraud memory rules
- cooldown or suppression logic

Example rules:

- block if `customer.tx_count_10m > 5` and `customer.previous_review_count_24h > 1`
- review if `device.distinct_accounts_1d >= 3`
- block if `customer.amount_sum_24h > merchant.customer_avg_amount_30d * 5`
- review if `sequence.login_device_change_payment_15m == true`

### 5.4 Cross-Entity Graph Risk

Graph intelligence must become part of the online risk state, not only a separate enrichment.

Required capabilities:

- entity linkage scoring
- fraud ring membership
- shared resource detection
- graph-based repeat abuse patterns
- transitive risk propagation

### 5.5 Analyst Feedback Loop

Manual fraud operations must feed back into state.

Required capabilities:

- entity watchlist / allowlist / denylist
- analyst-confirmed fraud marker
- false-positive memory
- case-derived trust/risk adjustments
- linked-entity propagation

### 5.6 ML-Ready Dataset Logging

Even if ML is not immediate, state must be designed so future models can train on correct longitudinal behavior.

Required capabilities:

- feature snapshot logging at decision time
- delayed outcome joins
- label integration from analyst outcomes and chargebacks
- feature versioning
- training export path

## 6. Technical Architecture Scope

## 6.1 Storage Responsibilities

State must be split by latency and durability requirements.

### Redis

Use for low-latency online counters and hot state.

Recommended state:

- sliding window counters
- short-lived sequence buffers
- recent entity activity markers
- cooldown timers
- burst detection state
- online feature cache

### PostgreSQL

Use for durable historical state and auditability.

Recommended state:

- decision history
- case history
- analyst labels
- customer risk profile snapshots
- feature snapshots at decision time
- watchlist / allowlist / denylist
- entity state materialization for debugging and exports

### Kafka

Use for event propagation and asynchronous state updates.

Recommended uses:

- raw event ingestion
- feature update events
- decision state update events
- analyst feedback events
- graph update events

### Neo4j

Use for connected-entity state and ring detection.

Recommended uses:

- shared device/account relationships
- shared IP/account relationships
- fraud cluster analysis
- linked risk propagation

## 6.2 Recommended State Model

### Online state

Fast read/write fraud state needed during decisioning.

Examples:

- `velocity:{merchantId}:{entityType}:{entityId}:{window}`
- `sequence:{merchantId}:{entityType}:{entityId}`
- `risk-memory:{merchantId}:{entityType}:{entityId}`

### Durable state

Persistent state stored for correctness, recovery, and audit.

Examples:

- `entity_profiles`
- `entity_state_snapshots`
- `decision_feature_snapshots`
- `entity_watchlists`
- `fraud_labels`

## 6.3 Entity State Snapshot

Recommended durable structure:

- entity type
- entity id
- merchant id
- first seen at
- last seen at
- current risk memory score
- recent decision counts by outcome
- recent event counters
- linked entity counts
- analyst flags
- graph flags
- updated at

## 7. Data Model Additions

Recommended new tables or durable models:

- `entity_profiles`
- `entity_state_snapshots`
- `decision_feature_snapshots`
- `analyst_labels`
- `watchlist_entries`
- `allowlist_entries`
- `denylist_entries`
- `feature_definitions`
- `feature_versions`

Recommended new Kafka topics:

- `signalrisk.state.feature-updates`
- `signalrisk.state.entity-updates`
- `signalrisk.state.labels`
- `signalrisk.state.graph-updates`

## 8. Decisioning Changes Required

The decision pipeline should evolve from:

- collect signals
- compute score
- return action

To:

- collect stateless signals
- load online entity state
- compute stateful features
- evaluate stateless + stateful rules
- apply graph enrichment
- apply prior-decision memory
- compute action
- emit updated entity state

## 9. Minimum Viable Stateful Fraud Scope

This is the recommended first production increment.

### MVP Stateful Features

- customer transaction count in 10m / 1h / 24h
- customer amount sum in 24h
- device distinct account count in 24h / 7d
- IP distinct account count in 1h / 24h
- previous REVIEW/BLOCK count for customer in 7d / 30d
- repeated same-amount transaction counter
- failed-to-successful attempt sequence marker
- merchant baseline comparison for amount and frequency

### MVP Stateful Rules

- repeated transaction burst
- repeated same-amount burst
- same device on multiple accounts
- same IP across multiple new accounts
- prior block + repeated attempt
- cumulative amount exceeds threshold

### MVP Case and Analyst Memory

- confirmed fraud marker on entity
- false positive marker on entity
- watchlist support
- denylist support

## 10. Phase 2 Stateful Scope

After MVP, add:

- graph-based risk propagation
- merchant-specific adaptive baselines
- more complex sequence engine
- entity trust decay and recovery
- cross-merchant abuse patterns where legally allowed
- model-ready feature extraction

## 11. State Management Requirements

Yes, state management is mandatory for this product.

It should not be treated as optional plumbing. It is core fraud logic.

The platform must support:

- temporal state
- cumulative state
- relational state
- feedback-driven state
- recoverable state after infra restart

## 12. Non-Functional Requirements

### Latency

Online state fetch and feature computation must fit inside decision latency budget.

Requirements:

- hot state retrieval in single-digit milliseconds where practical
- bounded timeout behavior
- graceful degradation when state store is unavailable

### Correctness

State updates must be:

- idempotent
- replay-safe
- scoped by tenant
- observable and auditable

### Isolation

State must always be tenant-scoped unless a deliberately approved cross-merchant feature exists.

### Recovery

Redis loss or eviction must not permanently erase durable fraud memory.

## 13. Risks If Not Implemented

If this scope is skipped, the platform will remain weak in:

- repeated fraud campaign detection
- account farming detection
- slow fraud detection
- low-and-slow evasion patterns
- cross-session behavior tracking
- analyst feedback utilization
- ML readiness

In practice, that means the system remains useful as a stateless risk API but not a strong fraud operations platform.

## 14. Recommended Epic Breakdown

### Epic A — Stateful Feature Store

- online counters
- feature computation service
- feature definitions
- feature freshness controls

### Epic B — Entity Timeline and Risk Memory

- entity profiles
- entity snapshots
- prior decision memory
- cooldown logic

### Epic C — Stateful Rules and Sequences

- rule context expansion
- sequence detectors
- cumulative risk rules
- repeat-pattern rules

### Epic D — Analyst Feedback State

- labels
- watchlist/allowlist/denylist
- linked-entity propagation

### Epic E — Graph-Backed Stateful Risk

- graph-derived online features
- ring score enrichment
- transitive linkage features

### Epic F — ML Readiness

- feature snapshot logging
- labeled outcome joins
- training export pipeline

## 15. Recommended Delivery Order

1. online counters and stateful MVP features
2. prior decision memory
3. stateful rules
4. analyst feedback state
5. graph-backed enrichment
6. ML-ready feature logging

## 16. Final Recommendation

SignalRisk should explicitly adopt stateful fraud detection as a first-class platform capability.

Recommended product stance:

- current platform = real-time signal and rule engine
- next platform stage = stateful fraud decisioning engine

This is the correct next expansion if the goal is to detect repeated abuse, coordinated attacks, and progressive fraud behavior in production.
