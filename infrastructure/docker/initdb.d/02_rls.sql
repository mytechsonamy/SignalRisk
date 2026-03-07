-- 002_rls_policies.sql
-- SignalRisk: Row-Level Security policies for multi-tenant isolation
-- All tenant-scoped tables use current_setting('app.merchant_id') for filtering.
--
-- Usage from application:
--   SET LOCAL app.merchant_id = '<merchant-uuid>';
--   -- all subsequent queries in the transaction are tenant-scoped

BEGIN;

-- ============================================================================
-- Enable RLS on all tenant-scoped tables
-- ============================================================================
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_requests ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (safety net for superuser queries)
ALTER TABLE users               FORCE ROW LEVEL SECURITY;
ALTER TABLE devices             FORCE ROW LEVEL SECURITY;
ALTER TABLE events              FORCE ROW LEVEL SECURITY;
ALTER TABLE decisions           FORCE ROW LEVEL SECURITY;
ALTER TABLE idempotency_requests FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- RESTRICTIVE policies: one policy per table, covers all operations
-- ============================================================================

CREATE POLICY tenant_isolation_users ON users
    AS RESTRICTIVE
    FOR ALL
    USING (merchant_id = current_setting('app.merchant_id')::UUID)
    WITH CHECK (merchant_id = current_setting('app.merchant_id')::UUID);

CREATE POLICY tenant_isolation_devices ON devices
    AS RESTRICTIVE
    FOR ALL
    USING (merchant_id = current_setting('app.merchant_id')::UUID)
    WITH CHECK (merchant_id = current_setting('app.merchant_id')::UUID);

CREATE POLICY tenant_isolation_events ON events
    AS RESTRICTIVE
    FOR ALL
    USING (merchant_id = current_setting('app.merchant_id')::UUID)
    WITH CHECK (merchant_id = current_setting('app.merchant_id')::UUID);

CREATE POLICY tenant_isolation_decisions ON decisions
    AS RESTRICTIVE
    FOR ALL
    USING (merchant_id = current_setting('app.merchant_id')::UUID)
    WITH CHECK (merchant_id = current_setting('app.merchant_id')::UUID);

CREATE POLICY tenant_isolation_idempotency ON idempotency_requests
    AS RESTRICTIVE
    FOR ALL
    USING (merchant_id = current_setting('app.merchant_id')::UUID)
    WITH CHECK (merchant_id = current_setting('app.merchant_id')::UUID);

-- ============================================================================
-- Application role (non-superuser) that the API connects as
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'signalrisk_app') THEN
        CREATE ROLE signalrisk_app LOGIN;
    END IF;
END
$$;

-- Grant minimum required privileges
GRANT USAGE ON SCHEMA public TO signalrisk_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
    merchants, users, devices, events, decisions,
    outbox_events, idempotency_requests, processed_events
TO signalrisk_app;

COMMIT;
