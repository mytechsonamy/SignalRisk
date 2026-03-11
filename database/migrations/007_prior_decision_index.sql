-- Sprint 3: Prior-decision memory index (ADR-011)
-- Supports fast lookback queries for BLOCK/REVIEW counts per entity.
-- Required guardrail: 30-day MAX lookback, 50ms timeout.

-- Index for merchant + device_id + created_at (covers the most common query pattern)
CREATE INDEX IF NOT EXISTS idx_decisions_merchant_device_created
  ON decisions (merchant_id, device_id, created_at DESC)
  WHERE device_id IS NOT NULL;

-- Index for merchant + entity_id pattern using request metadata
-- device_id is the primary entity identifier in the decisions table
CREATE INDEX IF NOT EXISTS idx_decisions_merchant_created
  ON decisions (merchant_id, created_at DESC);

-- Track this migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('007', '007_prior_decision_index', NOW())
ON CONFLICT (version) DO NOTHING;
