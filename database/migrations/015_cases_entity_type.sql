-- 015: Add entity_type to cases table for typed entity tracking
-- Supports: customer, device, ip (per ADR-009)
-- Default 'customer' for historical compatibility (FD-3)

-- Add email unique constraint (FD-1)
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);

-- Add entity_type column to cases
ALTER TABLE cases ADD COLUMN IF NOT EXISTS entity_type TEXT
  CHECK (entity_type IN ('customer', 'device', 'ip'))
  DEFAULT 'customer';

-- Backfill: existing cases get 'customer' (majority correct)
UPDATE cases SET entity_type = 'customer' WHERE entity_type IS NULL;

-- Index for entity lookups
CREATE INDEX IF NOT EXISTS idx_cases_entity_type ON cases (merchant_id, entity_type, entity_id);

-- Track this migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('015', '015_cases_entity_type', NOW())
ON CONFLICT (version) DO NOTHING;
