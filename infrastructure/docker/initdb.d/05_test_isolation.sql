-- Test isolation + flexible column types + seed test merchants
-- Sprint 23 + Sprint 25 (merchant_id TEXT for string-based auth)

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_decisions_is_test ON decisions(is_test) WHERE is_test = true;

ALTER TABLE decisions ALTER COLUMN device_id DROP NOT NULL;
ALTER TABLE decisions DROP CONSTRAINT IF EXISTS decisions_device_id_fkey;

-- request_id as TEXT to support non-UUID event IDs
ALTER TABLE decisions DROP CONSTRAINT IF EXISTS uq_decisions_merchant_request;
ALTER TABLE decisions ALTER COLUMN request_id TYPE TEXT USING request_id::text;

-- merchant_id as TEXT to support string-based merchant IDs from auth-service
-- Auth-service uses string IDs (merchant-001, merchant-a) not UUIDs
ALTER TABLE decisions DROP CONSTRAINT IF EXISTS decisions_merchant_id_fkey;
ALTER TABLE decisions ALTER COLUMN merchant_id TYPE TEXT USING merchant_id::text;
ALTER TABLE decisions ADD CONSTRAINT uq_decisions_merchant_request UNIQUE (merchant_id, request_id);

-- device_id as TEXT to support string-based device IDs
ALTER TABLE decisions ALTER COLUMN device_id TYPE TEXT USING device_id::text;

-- Update RLS policy on decisions to work with TEXT merchant_id
DROP POLICY IF EXISTS tenant_isolation_decisions ON decisions;
CREATE POLICY tenant_isolation_decisions ON decisions
    AS RESTRICTIVE
    FOR ALL
    USING (merchant_id = current_setting('app.merchant_id'))
    WITH CHECK (merchant_id = current_setting('app.merchant_id'));

-- Seed test merchant for FraudTester
INSERT INTO merchants (id, name, api_key_prefix, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Merchant', 'sk_test_0000', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;
