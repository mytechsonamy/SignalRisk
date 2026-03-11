-- ============================================================================
-- Migration version tracking table
-- Records which migrations have been applied and when.
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id              BIGSERIAL PRIMARY KEY,
    version         VARCHAR(20) NOT NULL UNIQUE,
    description     TEXT,
    applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    execution_ms    INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);

-- Record all previously applied migrations
INSERT INTO schema_migrations (version, description) VALUES
    ('001', 'Initial schema: merchants, users, devices, events, decisions, outbox'),
    ('002', 'RLS policies on tenant-scoped tables'),
    ('003', 'Performance indexes'),
    ('004', 'Refresh tokens table'),
    ('005', 'Test isolation flag on decisions'),
    ('006', 'Cases TEXT to UUID migration'),
    ('007', 'Merchants table extensions (Sprint 32)'),
    ('008', 'Schema migrations tracking table')
ON CONFLICT (version) DO NOTHING;
