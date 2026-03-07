-- 001_initial_schema.sql
-- SignalRisk: Core tables for real-time fraud detection platform
-- Multi-tenant PostgreSQL with RLS

BEGIN;

-- ============================================================================
-- Extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Custom types
-- ============================================================================
CREATE TYPE merchant_status AS ENUM ('ACTIVE', 'SUSPENDED', 'ONBOARDING');
CREATE TYPE user_role AS ENUM ('ADMIN', 'SENIOR_ANALYST', 'ANALYST', 'VIEWER');
CREATE TYPE event_type AS ENUM ('PAGE_VIEW', 'CLICK', 'FORM_SUBMIT', 'LOGIN', 'SIGNUP', 'PAYMENT', 'CUSTOM');
CREATE TYPE decision_outcome AS ENUM ('ALLOW', 'REVIEW', 'BLOCK');

-- ============================================================================
-- merchants
-- Top-level tenant table (not RLS-scoped itself; it IS the tenant)
-- ============================================================================
CREATE TABLE merchants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    api_key_prefix  VARCHAR(12) NOT NULL UNIQUE,
    status          merchant_status NOT NULL DEFAULT 'ONBOARDING',
    settings        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE merchants IS 'Top-level tenants. Each merchant has isolated data via RLS.';
COMMENT ON COLUMN merchants.api_key_prefix IS 'First 12 chars of hashed API key for quick lookup; full key stored in vault.';
COMMENT ON COLUMN merchants.settings IS 'Merchant-specific config: risk thresholds, webhook URLs, feature flags.';

-- ============================================================================
-- users (dashboard users)
-- ============================================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'ANALYST',
    mfa_secret      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_users_merchant_email UNIQUE (merchant_id, email)
);

COMMENT ON TABLE users IS 'Dashboard users who review fraud decisions.';

-- ============================================================================
-- devices
-- ============================================================================
CREATE TABLE devices (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id         UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    fingerprint         TEXT NOT NULL,
    fingerprint_prefix  VARCHAR(8) NOT NULL,
    trust_score         NUMERIC(5,2) NOT NULL DEFAULT 50.00,
    is_emulator         BOOLEAN NOT NULL DEFAULT false,
    attributes          JSONB NOT NULL DEFAULT '{}',
    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_devices_merchant_fingerprint UNIQUE (merchant_id, fingerprint)
);

COMMENT ON TABLE devices IS 'End-user devices identified by browser/device fingerprint.';
COMMENT ON COLUMN devices.fingerprint_prefix IS 'First 8 chars of fingerprint for fast fuzzy-match lookups.';
COMMENT ON COLUMN devices.attributes IS 'Flexible device signals: screen res, timezone, installed fonts, WebGL hash, etc.';

-- ============================================================================
-- events (partitioned by month on created_at)
-- ============================================================================
CREATE TABLE events (
    id              UUID NOT NULL DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL,
    device_id       UUID NOT NULL,
    session_id      UUID NOT NULL,
    type            event_type NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_events PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE events IS 'Raw behavioral events from the client SDK. Partitioned monthly.';
COMMENT ON COLUMN events.payload IS 'Event-specific data: coordinates, form fields, timing signals.';

-- Create partitions for current year (2026) and next few months
CREATE TABLE events_2026_01 PARTITION OF events FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE events_2026_02 PARTITION OF events FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE events_2026_03 PARTITION OF events FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE events_2026_04 PARTITION OF events FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE events_2026_05 PARTITION OF events FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE events_2026_06 PARTITION OF events FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE events_2026_07 PARTITION OF events FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE events_2026_08 PARTITION OF events FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE events_2026_09 PARTITION OF events FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE events_2026_10 PARTITION OF events FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE events_2026_11 PARTITION OF events FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE events_2026_12 PARTITION OF events FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Default partition catches anything outside defined ranges
CREATE TABLE events_default PARTITION OF events DEFAULT;

-- ============================================================================
-- decisions
-- ============================================================================
CREATE TABLE decisions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    request_id      UUID NOT NULL,
    device_id       UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    risk_score      NUMERIC(5,2) NOT NULL,
    decision        decision_outcome NOT NULL,
    risk_factors    JSONB NOT NULL DEFAULT '[]',
    signals         JSONB NOT NULL DEFAULT '{}',
    latency_ms      INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_decisions_merchant_request UNIQUE (merchant_id, request_id)
);

COMMENT ON TABLE decisions IS 'Fraud scoring decisions returned to merchants.';
COMMENT ON COLUMN decisions.risk_factors IS 'Array of contributing risk factors with weights.';
COMMENT ON COLUMN decisions.signals IS 'Raw signal snapshot at decision time for audit trail.';
COMMENT ON COLUMN decisions.latency_ms IS 'End-to-end scoring latency in milliseconds.';

-- ============================================================================
-- outbox_events (transactional outbox for Kafka)
-- ============================================================================
CREATE TABLE outbox_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_type  TEXT NOT NULL,
    aggregate_id    UUID NOT NULL,
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ
);

COMMENT ON TABLE outbox_events IS 'Transactional outbox: rows inserted atomically with domain writes, polled by Kafka connector.';
COMMENT ON COLUMN outbox_events.published_at IS 'Set by the outbox relay once the event is confirmed published to Kafka.';

-- ============================================================================
-- idempotency_requests (API request deduplication)
-- ============================================================================
CREATE TABLE idempotency_requests (
    request_id      UUID PRIMARY KEY,
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    response        JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

COMMENT ON TABLE idempotency_requests IS 'Stores API responses keyed by idempotency key for safe retries.';

-- ============================================================================
-- processed_events (Kafka consumer deduplication)
-- ============================================================================
CREATE TABLE processed_events (
    event_id        UUID NOT NULL,
    consumer_group  TEXT NOT NULL,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_processed_events PRIMARY KEY (event_id, consumer_group)
);

COMMENT ON TABLE processed_events IS 'Tracks which Kafka events each consumer group has already processed.';

-- ============================================================================
-- updated_at trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_merchants_updated_at
    BEFORE UPDATE ON merchants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
