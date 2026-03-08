-- ============================================================================
-- Sprint 32: Extend merchants table for MerchantRepository v2
-- Adds columns needed by auth-service MerchantRepository CRUD operations.
-- ============================================================================

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS api_key_hash TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER DEFAULT 1000;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'default';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS client_secret_hash TEXT;
