# Skill: docker-compose-e2e

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | DEVOPS_SRE |
| **Category** | infrastructure |
| **Dependencies** | docker-kubernetes |

## Description
Full microservices stack orchestration with Docker Compose for local development and E2E test environments. Covers deterministic startup ordering via `healthcheck` + `condition: service_healthy`, named volumes, bridge networking, and CI/CD integration for SignalRisk's 12-service + 4-infra topology.

## Patterns

### 1. Healthcheck + condition:service_healthy
Every service declares a `healthcheck` block. Downstream services reference upstream services with `condition: service_healthy` inside `depends_on`. Docker will not start the dependent container until the dependency passes its health check.

```yaml
# Infrastructure example — PostgreSQL
postgres:
  image: postgres:16-alpine
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U signalrisk -d signalrisk"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 15s

# Redis
redis:
  image: redis:7-alpine
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 10s

# NestJS app service
auth-service:
  healthcheck:
    test: ["CMD-SHELL", "curl -f http://localhost:3001/health || exit 1"]
    interval: 15s
    timeout: 5s
    retries: 5
    start_period: 30s
```

### 2. Startup Ordering (depends_on with conditions)
Chain `depends_on` entries to enforce a strict startup order:

```yaml
# Tier 1 — infra (start in parallel, no deps)
postgres: { ... }
redis:    { ... }
kafka:    { ... }
neo4j:    { ... }

# Tier 2 — gate (requires infra)
auth-service:
  depends_on:
    postgres: { condition: service_healthy }
    redis:    { condition: service_healthy }
    kafka:    { condition: service_healthy }

# Tier 3 — intake (requires infra + auth)
event-collector:
  depends_on:
    postgres:     { condition: service_healthy }
    redis:        { condition: service_healthy }
    kafka:        { condition: service_healthy }
    auth-service: { condition: service_healthy }

# Tier 4 — intel services (require infra only, start in parallel)
device-intel-service:
  depends_on:
    postgres: { condition: service_healthy }
    redis:    { condition: service_healthy }
    kafka:    { condition: service_healthy }

# Tier 5 — engine (requires all intel services to be healthy)
decision-service:
  depends_on:
    device-intel-service: { condition: service_healthy }
    velocity-service:     { condition: service_healthy }
    # ... all intel services

# Tier 6 — ops (requires engine)
case-service:
  depends_on:
    decision-service: { condition: service_healthy }
```

### 3. YAML Anchors for DRY Configuration
Use YAML anchors (`&`) and aliases (`<<: *`) to avoid repeating environment variables and healthcheck parameters across 12 services:

```yaml
x-common-node-env: &common-node-env
  NODE_ENV: development
  DB_URL: postgresql://signalrisk:signalrisk_dev@postgres:5432/signalrisk
  REDIS_URL: redis://redis:6379
  KAFKA_BROKERS: kafka:29092

x-app-healthcheck: &app-healthcheck
  interval: 15s
  timeout: 5s
  retries: 5
  start_period: 30s

x-depends-infra: &depends-infra
  postgres: { condition: service_healthy }
  redis:    { condition: service_healthy }
  kafka:    { condition: service_healthy }

# Per-service usage
auth-service:
  environment:
    <<: *common-node-env
    PORT: "3001"
  depends_on:
    <<: *depends-infra
  healthcheck:
    test: ["CMD-SHELL", "curl -f http://localhost:3001/health || exit 1"]
    <<: *app-healthcheck
```

### 4. Kafka KRaft (No ZooKeeper) — Dual Listener Setup
Use two listeners so containers communicate on port 29092 while the host can reach port 9092:

```yaml
kafka:
  image: apache/kafka:latest
  environment:
    KAFKA_NODE_ID: "1"
    KAFKA_PROCESS_ROLES: broker,controller
    KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
    KAFKA_LISTENERS: PLAINTEXT://:29092,EXTERNAL://:9092,CONTROLLER://:9093
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,EXTERNAL://localhost:9092
    KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,EXTERNAL:PLAINTEXT
    KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
    KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: "1"
    KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
  healthcheck:
    test: ["CMD-SHELL", "kafka-broker-api-versions.sh --bootstrap-server kafka:29092 || exit 1"]
    interval: 15s
    timeout: 10s
    retries: 10
    start_period: 40s
```

### 5. Build vs Image Fallback
When Dockerfiles may not exist yet, combine `build` with `image` and a `command` override:

```yaml
auth-service:
  build:
    context: .
    dockerfile: apps/auth-service/Dockerfile
  image: node:20-alpine          # fallback if build fails
  command: >
    sh -c "cd /app/apps/auth-service && npx ts-node src/main.ts"
  working_dir: /app
  volumes:
    - .:/app:ro                  # mount source for ts-node fallback
```

### 6. Test Isolation for E2E
For E2E test runs, override the database to a separate test database using `--env-file`:

```bash
# .env.test
DB_URL=postgresql://signalrisk:signalrisk_dev@postgres:5432/signalrisk_test
KAFKA_BROKERS=kafka:29092
```

```bash
docker compose -f docker-compose.full.yml --env-file .env.test up -d
# run tests
docker compose -f docker-compose.full.yml down
```

### 7. CI/CD GitHub Actions Integration

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start full stack
        run: |
          docker compose -f docker-compose.full.yml up -d
          # Wait for all services to be healthy
          docker compose -f docker-compose.full.yml wait

      - name: Wait for decision-service health
        run: |
          timeout 120 bash -c \
            'until curl -sf http://localhost:3009/health; do sleep 3; done'

      - name: Run E2E tests
        run: |
          cd tests/e2e
          npm ci
          npm test

      - name: Collect logs on failure
        if: failure()
        run: docker compose -f docker-compose.full.yml logs --tail=100

      - name: Tear down
        if: always()
        run: docker compose -f docker-compose.full.yml down -v
```

## Named Volumes
Always use named volumes (not bind mounts) for stateful infrastructure data to survive container restarts:

```yaml
volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  kafka_data:
    driver: local
  neo4j_data:
    driver: local
```

## Network
All services share a single bridge network. Use service names as hostnames:

```yaml
networks:
  signalrisk-network:
    driver: bridge
    name: signalrisk-network
```

## Service Port Reference
| Service | Container Port | Host Port |
|---------|---------------|-----------|
| auth-service | 3001 | 3001 |
| event-collector | 3002 | 3002 |
| device-intel-service | 3003 | 3003 |
| velocity-service | 3004 | 3004 |
| behavioral-service | 3005 | 3005 |
| network-intel-service | 3006 | 3006 |
| telco-intel-service | 3007 | 3007 |
| rule-engine-service | 3008 | 3008 |
| decision-service | 3009 | 3009 |
| case-service | 3010 | 3010 |
| webhook-service | 3011 | 3011 |
| graph-intel-service | 3012 | 3012 |
| postgres | 5432 | 5432 |
| redis | 6379 | 6379 |
| kafka (external) | 9092 | 9092 |
| kafka (internal) | 29092 | — |
| neo4j browser | 7474 | 7474 |
| neo4j bolt | 7687 | 7687 |

## Constraints
- All app service healthchecks use `curl -f http://localhost:<port>/health || exit 1`
- `start_period` for app services is at minimum 30s to allow NestJS bootstrap
- Never use `depends_on` without `condition: service_healthy` — bare `depends_on` only waits for container start, not readiness
- In CI, always run `docker compose down -v` in an `if: always()` step to clean up volumes
- KAFKA_BROKERS env var for app services must use the internal listener: `kafka:29092`
- Neo4j `graph-intel-service` must additionally depend on `neo4j: condition: service_healthy`
