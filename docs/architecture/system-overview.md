# SignalRisk System Architecture

## Overview
Real-time fraud decision engine processing payments and carrier billing events with sub-100ms p99 latency.

## Service Map

```
                    +--------------------------------------------------+
                    |                   Clients                        |
                    |  Web SDK  |  Mobile SDK  |  Merchant API         |
                    +--------------------------------------------------+
                                         |
                                   (HTTPS + JWT)
                                         |
                    +--------------------v-----------------------------+
                    |              auth-service :3001                  |
                    |   JWT RS256 | API Keys | Rate Limit (1K/min)    |
                    +--------------------+-----------------------------+
                                         |
                    +--------------------v-----------------------------+
                    |           event-collector :3000                  |
                    |   Validation | Schema Registry | Kafka Publish  |
                    +--------------------+-----------------------------+
                                         |
                                  Kafka: fraud-events
                                         |
                    +--------------------v-----------------------------+
                    |           decision-service :3002                 |
                    |                                                  |
                    |  +------------------------------------------+   |
                    |  |         Signal Aggregation               |   |
                    |  |  (Promise.allSettled + circuit breaker)  |   |
                    |  +--+------+------+------+------+-----------+   |
                    |     |      |      |      |      |               |
                    |  dev   beh   net  telco  vel  graph             |
                    |  :3003 :3005 :3006 :3007 :3004 :3012           |
                    |                                                  |
                    |  +------------------------------------------+   |
                    |  |         Rule Engine :3008                |   |
                    |  |      DSL eval + Hot Reload               |   |
                    |  +------------------------------------------+   |
                    |                                                  |
                    |  Output: ALLOW / BLOCK / REVIEW                 |
                    +--------------------+-----------------------------+
                                         |
                    +--------------------v-----------------------------+
                    |              Kafka: fraud-decisions              |
                    +------+---------------------------+--------------+
                           |                           |
              +------------v----------+   +-----------v--------------+
              |  case-service :3010   |   |  webhook-service :3011   |
              |  Case mgmt + RLS      |   |  HMAC-SHA256 delivery    |
              +-----------------------+   +--------------------------+
```

## Data Flow
1. SDK sends event to auth-service which validates JWT/API key
2. event-collector validates schema, publishes to Kafka `fraud-events`
3. decision-service consumes, fetches all 5 signals in parallel (~20ms)
4. rule-engine evaluates DSL rules against signal bundle (~5ms)
5. Decision published to Kafka `fraud-decisions`, cached in Redis (5s TTL)
6. case-service creates case for BLOCK/REVIEW decisions
7. webhook-service delivers signed webhook to merchant

## Key SLAs

| Metric | Target |
|--------|--------|
| Decision p99 | < 100ms |
| Decision p95 | < 50ms |
| Throughput | >= 5,000 events/sec |
| Availability | 99.9% |
| Kafka consumer lag | < 1,000 |
| Cache hit rate | > 80% |
