-- Migration 008: Performance indexes for decision engine optimization
-- Applied: 2026-03-06

-- Composite index for case queries by merchant + status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_merchant_status
  ON cases(merchant_id, status)
  WHERE deleted_at IS NULL;

-- Partial index for open cases SLA monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_sla_open
  ON cases(sla_deadline, priority)
  WHERE status IN ('OPEN', 'IN_REVIEW') AND deleted_at IS NULL;

-- Device fingerprint lookup optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_devices_merchant_fingerprint
  ON devices(merchant_id, fingerprint_prefix)
  WHERE deleted_at IS NULL;

-- Velocity lookup by entity
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_velocity_entity_dim
  ON velocity_counters(entity_id, dimension, window_start DESC);

-- Audit log query optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_merchant_ts
  ON audit_log(merchant_id, created_at DESC);
