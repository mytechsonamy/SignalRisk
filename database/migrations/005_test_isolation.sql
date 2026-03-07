-- 005_test_isolation.sql
-- Adds test isolation flag to decisions table.
-- Events sent with X-SignalRisk-Test: true header are marked is_test = true
-- and excluded from analytics, dashboards, and webhook delivery.

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

-- Partial index: only index test rows (few compared to production)
CREATE INDEX IF NOT EXISTS idx_decisions_is_test ON decisions(is_test) WHERE is_test = true;

-- Comment for documentation
COMMENT ON COLUMN decisions.is_test IS 'True for events sent via FraudTester or with X-SignalRisk-Test header. Excluded from analytics.';
