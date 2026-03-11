-- Sprint 6: Watchlist entries — denylist/allowlist/watchlist per entity
-- Supports FRAUD→denylist, LEGITIMATE→cooldown per ADR-012.

CREATE TABLE IF NOT EXISTS watchlist_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     TEXT NOT NULL,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('customer', 'device', 'ip')),
  entity_id       TEXT NOT NULL,
  list_type       TEXT NOT NULL CHECK (list_type IN ('denylist', 'allowlist', 'watchlist')),
  reason          TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto_fraud', 'auto_legitimate', 'system')),
  expires_at      TIMESTAMPTZ, -- null = permanent
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_watchlist_merchant_type_entity_list
    UNIQUE (merchant_id, entity_type, entity_id, list_type)
);

-- Index for decision-time lookup (fast: is this entity on a list?)
CREATE INDEX IF NOT EXISTS idx_watchlist_active_lookup
  ON watchlist_entries (merchant_id, entity_type, entity_id, list_type)
  WHERE is_active = true;

-- Index for expiry cleanup
CREATE INDEX IF NOT EXISTS idx_watchlist_expires
  ON watchlist_entries (expires_at)
  WHERE expires_at IS NOT NULL AND is_active = true;

-- RLS policy
ALTER TABLE watchlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY watchlist_entries_tenant_isolation ON watchlist_entries
  USING (merchant_id = current_setting('app.merchant_id', true))
  WITH CHECK (merchant_id = current_setting('app.merchant_id', true));

-- Track this migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('011', '011_watchlist_entries', NOW())
ON CONFLICT (version) DO NOTHING;
