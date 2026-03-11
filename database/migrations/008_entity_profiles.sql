-- Sprint 5: Entity profiles — durable state for entity risk memory
-- Tracks first_seen, last_seen, cumulative risk indicators per entity.

CREATE TABLE IF NOT EXISTS entity_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     TEXT NOT NULL,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('customer', 'device', 'ip')),
  entity_id       TEXT NOT NULL,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_tx_count  INTEGER NOT NULL DEFAULT 0,
  total_block_count INTEGER NOT NULL DEFAULT 0,
  total_review_count INTEGER NOT NULL DEFAULT 0,
  total_allow_count INTEGER NOT NULL DEFAULT 0,
  risk_score_avg  NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_watchlisted  BOOLEAN NOT NULL DEFAULT false,
  watchlist_reason TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_entity_profiles_merchant_type_entity
    UNIQUE (merchant_id, entity_type, entity_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_entity_profiles_merchant_entity
  ON entity_profiles (merchant_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_entity_profiles_watchlisted
  ON entity_profiles (merchant_id, is_watchlisted)
  WHERE is_watchlisted = true;

CREATE INDEX IF NOT EXISTS idx_entity_profiles_last_seen
  ON entity_profiles (merchant_id, last_seen_at DESC);

-- RLS policy
ALTER TABLE entity_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY entity_profiles_tenant_isolation ON entity_profiles
  USING (merchant_id = current_setting('app.merchant_id', true))
  WITH CHECK (merchant_id = current_setting('app.merchant_id', true));

-- Track this migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('008', '008_entity_profiles', NOW())
ON CONFLICT (version) DO NOTHING;
