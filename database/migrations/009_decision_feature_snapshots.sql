-- Sprint 5: Decision feature snapshots — ML-ready structured feature storage
-- Captures all signal features at decision time for training dataset export.

CREATE TABLE IF NOT EXISTS decision_feature_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id     UUID NOT NULL,
  merchant_id     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  entity_type     TEXT NOT NULL DEFAULT 'customer' CHECK (entity_type IN ('customer', 'device', 'ip')),
  decision        TEXT NOT NULL CHECK (decision IN ('ALLOW', 'REVIEW', 'BLOCK')),
  risk_score      NUMERIC(5,2) NOT NULL,
  -- Structured feature columns (denormalized for fast ML export)
  f_device_trust_score       NUMERIC(5,2),
  f_device_is_emulator       BOOLEAN,
  f_device_days_since_first  INTEGER,
  f_velocity_tx_count_10m    INTEGER,
  f_velocity_tx_count_1h     INTEGER,
  f_velocity_tx_count_24h    INTEGER,
  f_velocity_amount_sum_1h   NUMERIC(12,2),
  f_velocity_amount_sum_24h  NUMERIC(12,2),
  f_velocity_unique_devices  INTEGER,
  f_velocity_unique_ips      INTEGER,
  f_velocity_burst_detected  BOOLEAN,
  f_behavioral_risk_score    NUMERIC(5,2),
  f_behavioral_is_bot        BOOLEAN,
  f_behavioral_bot_prob      NUMERIC(5,4),
  f_network_risk_score       NUMERIC(5,2),
  f_network_is_proxy         BOOLEAN,
  f_network_is_vpn           BOOLEAN,
  f_network_is_tor           BOOLEAN,
  f_network_geo_mismatch     NUMERIC(5,2),
  f_telco_prepaid_prob       NUMERIC(5,4),
  f_telco_is_ported          BOOLEAN,
  -- Stateful features (ADR-010)
  f_stateful_prev_block_30d  INTEGER,
  f_stateful_prev_review_7d  INTEGER,
  -- Full signal payload for debugging
  signals_raw     JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for ML export queries (by merchant + time range)
CREATE INDEX IF NOT EXISTS idx_feature_snapshots_merchant_created
  ON decision_feature_snapshots (merchant_id, created_at DESC);

-- Index for joining with decisions
CREATE INDEX IF NOT EXISTS idx_feature_snapshots_decision
  ON decision_feature_snapshots (decision_id);

-- RLS policy
ALTER TABLE decision_feature_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY feature_snapshots_tenant_isolation ON decision_feature_snapshots
  USING (merchant_id = current_setting('app.merchant_id', true))
  WITH CHECK (merchant_id = current_setting('app.merchant_id', true));

-- Track this migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('009', '009_decision_feature_snapshots', NOW())
ON CONFLICT (version) DO NOTHING;
