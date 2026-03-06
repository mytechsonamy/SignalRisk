-- Migration 007: Add soft-delete support and retention indexes
-- Supports GDPR purge policies and data retention jobs

-- Add soft-delete columns
ALTER TABLE cases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Indexes for retention queries
-- Cases: find resolved cases older than retention window
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_retention
  ON cases(updated_at) WHERE status = 'RESOLVED' AND deleted_at IS NULL;

-- Devices: find stale devices by last_seen_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_devices_retention
  ON devices(last_seen_at) WHERE deleted_at IS NULL;
