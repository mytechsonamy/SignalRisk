-- 003_indexes.sql
-- SignalRisk: Performance indexes
-- All tenant-scoped indexes lead with merchant_id to align with RLS filter pushdown.

BEGIN;

-- ============================================================================
-- merchants
-- ============================================================================
CREATE INDEX idx_merchants_status ON merchants (status);

-- ============================================================================
-- users
-- ============================================================================
-- Email lookup within tenant (unique constraint already creates an index on (merchant_id, email))
-- Additional index for cross-tenant email lookup by superadmin
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_merchant_role ON users (merchant_id, role);

-- ============================================================================
-- devices
-- ============================================================================
-- Fuzzy fingerprint match: prefix search scoped to tenant
CREATE INDEX idx_devices_merchant_fingerprint_prefix
    ON devices (merchant_id, fingerprint_prefix);

-- Trust score queries (find risky devices)
CREATE INDEX idx_devices_merchant_trust_score
    ON devices (merchant_id, trust_score);

-- Emulator detection
CREATE INDEX idx_devices_merchant_emulator
    ON devices (merchant_id, is_emulator)
    WHERE is_emulator = true;

-- Last-seen for cleanup/analytics
CREATE INDEX idx_devices_merchant_last_seen
    ON devices (merchant_id, last_seen_at DESC);

-- ============================================================================
-- events (partitioned -- indexes are created on each partition automatically)
-- ============================================================================
-- Composite index for tenant + time range queries
CREATE INDEX idx_events_merchant_created
    ON events (merchant_id, created_at DESC);

-- Device activity within tenant
CREATE INDEX idx_events_merchant_device
    ON events (merchant_id, device_id, created_at DESC);

-- Session reconstruction
CREATE INDEX idx_events_merchant_session
    ON events (merchant_id, session_id, created_at);

-- Event type filtering
CREATE INDEX idx_events_merchant_type
    ON events (merchant_id, type, created_at DESC);

-- ============================================================================
-- decisions
-- ============================================================================
-- Time-range queries (dashboard, analytics)
CREATE INDEX idx_decisions_merchant_created
    ON decisions (merchant_id, created_at DESC);

-- Device risk history
CREATE INDEX idx_decisions_merchant_device
    ON decisions (merchant_id, device_id, created_at DESC);

-- Filter by outcome
CREATE INDEX idx_decisions_merchant_decision
    ON decisions (merchant_id, decision, created_at DESC);

-- High-risk decisions (score > 80) for alert dashboards
CREATE INDEX idx_decisions_merchant_high_risk
    ON decisions (merchant_id, created_at DESC)
    WHERE risk_score >= 80;

-- ============================================================================
-- outbox_events
-- ============================================================================
-- Unpublished events polling (outbox relay picks these up)
CREATE INDEX idx_outbox_unpublished
    ON outbox_events (created_at)
    WHERE published_at IS NULL;

-- Aggregate lookup for event sourcing replay
CREATE INDEX idx_outbox_aggregate
    ON outbox_events (aggregate_type, aggregate_id, created_at);

-- ============================================================================
-- idempotency_requests
-- ============================================================================
-- Expired request cleanup
CREATE INDEX idx_idempotency_expires
    ON idempotency_requests (expires_at)
    WHERE expires_at < now();

-- Tenant scoped lookups
CREATE INDEX idx_idempotency_merchant
    ON idempotency_requests (merchant_id, created_at DESC);

-- ============================================================================
-- processed_events
-- ============================================================================
-- Cleanup of old processed records
CREATE INDEX idx_processed_events_processed_at
    ON processed_events (processed_at);

COMMIT;
