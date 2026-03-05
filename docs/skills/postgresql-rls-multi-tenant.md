# Skill: postgresql-rls-multi-tenant

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | DATABASE, BACKEND_NODE |
| **Category** | database |

## Description
PostgreSQL schema design with Row-Level Security (RLS) for multi-tenant isolation in SignalRisk. All tenant tables use RESTRICTIVE RLS policies with AsyncLocalStorage-driven SET LOCAL for guaranteed query scoping.

## Patterns
- All tenant-scoped tables include `merchant_id UUID NOT NULL` column
- Single RESTRICTIVE RLS policy per table (prevents permissive OR bypass)
- PgBouncer SET LOCAL pattern: set `app.merchant_id` at transaction start
- Prisma `$executeRaw` for SET LOCAL before queries
- Transactional outbox table for atomic DB write + Kafka publish
- Dedicated `idempotency_requests` table (non-partitioned) for durable request dedup
- JSONB columns for flexible signal data that varies per intelligence module

## Architecture Reference
architecture-v3.md#3-data-architecture

## Code Examples
```sql
-- RLS policy (RESTRICTIVE, not permissive)
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON devices
  AS RESTRICTIVE
  FOR ALL
  USING (merchant_id = current_setting('app.merchant_id')::uuid);

-- Tenant context in NestJS/Prisma
-- PrismaService wraps all queries with SET LOCAL
async $transaction<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const merchantId = this.tenantContext.getMerchantId();
  return this.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL app.merchant_id = ${merchantId}`;
    return fn(tx);
  });
}

-- Transactional outbox
CREATE TABLE outbox_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type TEXT NOT NULL,
  aggregate_id   UUID NOT NULL,
  event_type     TEXT NOT NULL,
  payload        JSONB NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  published_at   TIMESTAMPTZ  -- NULL until Kafka relay publishes
);

-- Idempotency table
CREATE TABLE idempotency_requests (
  request_id    TEXT PRIMARY KEY,
  merchant_id   UUID NOT NULL,
  response       JSONB,
  created_at     TIMESTAMPTZ DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL
);
```

## Constraints
- NEVER use permissive RLS policies -- always RESTRICTIVE
- Every tenant table MUST have RLS enabled with the tenant_isolation policy
- All database access MUST go through PrismaService which sets SET LOCAL
- Cross-tenant negative tests required for every new endpoint
- Use PgBouncer in transaction mode for connection pooling
- Indexes: always include merchant_id in composite indexes for RLS efficiency
