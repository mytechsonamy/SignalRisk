# SignalRisk System Architecture

## Overview
Real-time fraud decision engine for payment and carrier billing events. The current baseline includes stateful fraud scoring, typed entity memory, closed-loop analyst feedback enforcement, and Level 4/5 production-hardening changes implemented in code through Sprint 39. Remaining work is centered on runtime verification, evidence reruns, and final staging validation.

## Service Map

```
                    +--------------------------------------------------+
                    |                   Clients                        |
                    |  Web SDK  |  Mobile SDK  |  Dashboard :5173      |
                    +--------------------------------------------------+
                                         |
                             (HTTPS + JWT / API Key)
                                         |
                    +--------------------v-----------------------------+
                    |              auth-service :3001                  |
                    |   JWT RS256 | API Keys | DB-backed operator     |
                    |   login + password flows                        |
                    +--------------------+-----------------------------+
                                         |
                    +--------------------v-----------------------------+
                    |           event-collector :3002                  |
                    |   Validation | Backpressure | Kafka Publish     |
                    +--------------------+-----------------------------+
                                         |
                           Kafka: signalrisk.events.raw
                                         |
                    +--------------------v-----------------------------+
                    |           decision-service :3009                 |
                    |                                                  |
                    |  +------------------------------------------+   |
                    |  |         Signal Aggregation               |   |
                    |  |   (fetchAllSignals + circuit breaker)    |   |
                    |  +--+------+------+------+------+-----------+   |
                    |     |      |      |      |      |               |
                    |  dev   beh   net  telco  vel  graph             |
                    |  :3003 :3005 :3006 :3007 :3004 :3012           |
                    |                                                  |
                    |  +------------------------------------------+   |
                    |  |         Rule Engine :3008                |   |
                    |  |   DSL eval + stateful overrides          |   |
                    |  +------------------------------------------+   |
                    |                                                  |
                    |  Watchlist enforcement + feature snapshots      |
                    |  Output: ALLOW / BLOCK / REVIEW                 |
                    +--------------------+-----------------------------+
                                         |
                    +--------------------v-----------------------------+
                    |           Kafka: signalrisk.decisions           |
                    +------+---------------------+--------------------+
                           |                     |
              +------------v----------+   +-----------v--------------+
              |  case-service :3010   |   |  webhook-service :3011   |
              |  Case mgmt + RLS      |   |  HMAC-SHA256 delivery    |
              +-----------------------+   +--------------------------+
                           |
              +------------v-----------------------------------------+
              |         Kafka: signalrisk.state.labels               |
              |  analyst labels -> decision feedback consumers       |
              +------------------------------------------------------+
```

## Data Flow
1. SDK or dashboard client authenticates through `auth-service`; event ingestion uses API keys and operator access uses RS256 JWTs.
2. `event-collector` validates incoming events and publishes to `signalrisk.events.raw`.
3. `decision-service` consumes the event, calls `fetchAllSignals()`, enriches with stateful context and typed prior-decision memory, then evaluates DSL rules.
4. Decision-time feedback enforcement checks denylist/watchlist/allowlist state before final action is emitted.
5. Final decision is published to `signalrisk.decisions`, cached briefly in Redis, persisted in PostgreSQL, and feature snapshots are written for analysis.
6. `case-service` creates cases for BLOCK/REVIEW decisions and emits analyst labels to `signalrisk.state.labels`.
7. `decision-service` feedback consumers update watchlist and entity profile state from analyst outcomes.
8. `webhook-service` delivers signed merchant callbacks; dashboard WebSocket clients receive tenant-scoped live decision updates.

## Current Maturity Notes

- Level 3 Stateful Fraud Engine is implemented in code.
- Level 4 Closed-Loop Fraud building blocks are implemented in code, including analyst feedback enforcement and durable entity state updates.
- Level 5 Production hardening is largely implemented in code, including DB-backed operator auth, RS256 WebSocket auth, real gate checks, and feature snapshots.
- Remaining validation is operational rather than architectural: stack reruns, UAT/evidence refresh, and staging verification.

Related references:

- [Data Model](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/architecture/data-model.md)
- [Merchant Integration Guide](/Users/musti/Documents/Documents%20-%20Mustafa%20MacBook%20Pro/Projects/signalrisk/docs/product/merchant-integration-guide.md)
