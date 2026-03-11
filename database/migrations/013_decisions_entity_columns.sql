-- 013: Add entity_id and entity_type to decisions for typed prior-decision memory
-- Supports ADR-009 (entity identity standard) + ADR-011 (prior-decision memory guardrails)

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS entity_type TEXT
  CHECK (entity_type IN ('customer', 'device', 'ip'));

-- Backfill: existing rows get device_id as entity_id, entity_type = 'device'
UPDATE decisions SET entity_id = device_id, entity_type = 'device'
  WHERE entity_id IS NULL AND device_id IS NOT NULL;

-- Index for prior-decision memory queries (ADR-011 + ADR-009)
-- Optimized for: WHERE merchant_id = $1 AND entity_id = $2 AND entity_type = $3 AND created_at > ...
CREATE INDEX IF NOT EXISTS idx_decisions_entity_type_created
  ON decisions (merchant_id, entity_id, entity_type, created_at DESC)
  WHERE entity_id IS NOT NULL;

-- Track this migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('013', '013_decisions_entity_columns', NOW())
ON CONFLICT (version) DO NOTHING;
