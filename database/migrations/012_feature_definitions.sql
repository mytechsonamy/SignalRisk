-- Sprint 8: Feature definitions — feature governance registry
-- Tracks all stateful features with versioning for ML reproducibility.

CREATE TABLE IF NOT EXISTS feature_definitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name    TEXT NOT NULL,      -- e.g. 'stateful.customer.txCount10m'
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('customer', 'device', 'ip', 'global')),
  data_type       TEXT NOT NULL CHECK (data_type IN ('counter', 'sum', 'hll', 'boolean', 'enum', 'score')),
  "window"        TEXT,               -- e.g. '10m', '1h', '24h', '30d', null for non-temporal
  source_service  TEXT NOT NULL,      -- e.g. 'velocity-service', 'decision-service'
  redis_key_pattern TEXT,             -- e.g. '{merchantId}:vel:tx:{entityType}:{entityId}'
  description     TEXT NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_feature_name_version
    UNIQUE (feature_name, version)
);

-- Index for active feature lookups
CREATE INDEX IF NOT EXISTS idx_feature_defs_active
  ON feature_definitions (is_active, entity_type)
  WHERE is_active = true;

-- No RLS — feature definitions are global, not per-tenant

-- Seed initial feature definitions from source-of-truth.md
INSERT INTO feature_definitions (feature_name, entity_type, data_type, "window", source_service, redis_key_pattern, description, version)
VALUES
  -- Customer features
  ('stateful.customer.txCount10m', 'customer', 'counter', '10m', 'velocity-service', '{merchantId}:vel:tx:customer:{entityId}', 'Transaction count in last 10 minutes', 1),
  ('stateful.customer.txCount1h', 'customer', 'counter', '1h', 'velocity-service', '{merchantId}:vel:tx:customer:{entityId}', 'Transaction count in last 1 hour', 1),
  ('stateful.customer.txCount24h', 'customer', 'counter', '24h', 'velocity-service', '{merchantId}:vel:tx:customer:{entityId}', 'Transaction count in last 24 hours', 1),
  ('stateful.customer.amountSum24h', 'customer', 'sum', '24h', 'velocity-service', '{merchantId}:vel:amt:customer:{entityId}', 'Amount sum in last 24 hours', 1),
  ('stateful.customer.previousBlockCount30d', 'customer', 'counter', '30d', 'decision-service', 'decisions table query', 'BLOCK count in last 30 days', 1),
  ('stateful.customer.previousReviewCount7d', 'customer', 'counter', '7d', 'decision-service', 'decisions table query', 'REVIEW count in last 7 days', 1),
  -- Device features
  ('stateful.device.distinctAccounts24h', 'device', 'hll', '24h', 'velocity-service', '{merchantId}:vel:uacc:device:{entityId}', 'Distinct accounts using this device in 24h', 1),
  ('stateful.device.distinctAccounts7d', 'device', 'hll', '7d', 'velocity-service', '{merchantId}:vel:uacc:device:{entityId}', 'Distinct accounts using this device in 7 days', 1),
  -- IP features
  ('stateful.ip.signupCount10m', 'ip', 'counter', '10m', 'velocity-service', '{merchantId}:vel:signup:ip:{entityId}', 'Signup count from this IP in 10 minutes', 1),
  ('stateful.ip.paymentCount1h', 'ip', 'counter', '1h', 'velocity-service', '{merchantId}:vel:pay:ip:{entityId}', 'Payment count from this IP in 1 hour', 1),
  ('stateful.ip.failedLogins30m', 'ip', 'counter', '30m', 'velocity-service', '{merchantId}:vel:fail:ip:{entityId}', 'Failed login count from this IP in 30 minutes', 1),
  -- Sequence features (Sprint 7)
  ('stateful.customer.loginThenPayment15m', 'customer', 'boolean', '15m', 'velocity-service', '{merchantId}:vel:seq:customer:{entityId}', 'Login followed by payment within 15 minutes', 1),
  ('stateful.customer.failedPaymentX3ThenSuccess10m', 'customer', 'boolean', '10m', 'velocity-service', '{merchantId}:vel:seq:customer:{entityId}', '3+ failed payments then success within 10 minutes', 1),
  ('stateful.customer.deviceChangeThenPayment30m', 'customer', 'boolean', '30m', 'velocity-service', '{merchantId}:vel:seq:customer:{entityId}', 'Device change followed by payment within 30 minutes', 1),
  -- Graph features (Sprint 8)
  ('stateful.graph.sharedDeviceCount', 'global', 'counter', NULL, 'graph-intel-service', 'Neo4j query', 'Number of accounts sharing the same device', 1),
  ('stateful.graph.sharedIpCount', 'global', 'counter', NULL, 'graph-intel-service', 'Neo4j query', 'Number of accounts sharing the same IP', 1),
  ('stateful.graph.fraudRingScore', 'global', 'score', NULL, 'graph-intel-service', 'Neo4j query', 'Fraud ring proximity score (0-100)', 1)
ON CONFLICT (feature_name, version) DO NOTHING;

-- Track this migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('012', '012_feature_definitions', NOW())
ON CONFLICT (version) DO NOTHING;
