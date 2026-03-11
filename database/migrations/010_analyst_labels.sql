-- Sprint 6: Analyst labels — entity-level labels from case resolutions
-- Propagates case outcomes to entity profiles for feedback loop.

CREATE TABLE IF NOT EXISTS analyst_labels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     TEXT NOT NULL,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('customer', 'device', 'ip')),
  entity_id       TEXT NOT NULL,
  case_id         UUID NOT NULL,
  label           TEXT NOT NULL CHECK (label IN ('FRAUD', 'LEGITIMATE', 'INCONCLUSIVE')),
  analyst_id      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for entity lookup
CREATE INDEX IF NOT EXISTS idx_analyst_labels_entity
  ON analyst_labels (merchant_id, entity_type, entity_id, created_at DESC);

-- Index for case lookup
CREATE INDEX IF NOT EXISTS idx_analyst_labels_case
  ON analyst_labels (case_id);

-- RLS policy
ALTER TABLE analyst_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY analyst_labels_tenant_isolation ON analyst_labels
  USING (merchant_id = current_setting('app.merchant_id', true))
  WITH CHECK (merchant_id = current_setting('app.merchant_id', true));

-- Track this migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('010', '010_analyst_labels', NOW())
ON CONFLICT (version) DO NOTHING;
