-- Test isolation + device_id nullable + seed test merchant
-- Sprint 23

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_decisions_is_test ON decisions(is_test) WHERE is_test = true;

ALTER TABLE decisions ALTER COLUMN device_id DROP NOT NULL;
ALTER TABLE decisions DROP CONSTRAINT IF EXISTS decisions_device_id_fkey;

-- request_id as TEXT to support non-UUID event IDs
ALTER TABLE decisions DROP CONSTRAINT IF EXISTS uq_decisions_merchant_request;
ALTER TABLE decisions ALTER COLUMN request_id TYPE TEXT USING request_id::text;
ALTER TABLE decisions ADD CONSTRAINT uq_decisions_merchant_request UNIQUE (merchant_id, request_id);

-- Seed test merchant for FraudTester
INSERT INTO merchants (id, name, api_key_prefix, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Merchant', 'sk_test_0000', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;
