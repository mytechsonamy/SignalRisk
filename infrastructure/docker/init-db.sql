-- =============================================================================
-- SignalRisk — PostgreSQL Initialization Script
-- Runs once on first container start via docker-entrypoint-initdb.d
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Row-Level Security (RLS) setup
-- ---------------------------------------------------------------------------

-- Application role used by services via PgBouncer
CREATE ROLE signalrisk_app LOGIN PASSWORD 'signalrisk_app_dev';
GRANT CONNECT ON DATABASE signalrisk TO signalrisk_app;

-- Grant schema usage (tables will be created by migrations)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO signalrisk_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO signalrisk_app;

-- Enable RLS helper: current tenant context via session variable
-- Services set this per-request: SET app.current_tenant = '<tenant_id>';
-- Example RLS policy (applied by migrations):
--   CREATE POLICY tenant_isolation ON <table>
--     USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- ---------------------------------------------------------------------------
-- Service-specific schemas (optional isolation)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS fraud;
CREATE SCHEMA IF NOT EXISTS compliance;
CREATE SCHEMA IF NOT EXISTS telemetry;

GRANT USAGE ON SCHEMA fraud TO signalrisk_app;
GRANT USAGE ON SCHEMA compliance TO signalrisk_app;
GRANT USAGE ON SCHEMA telemetry TO signalrisk_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA fraud
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO signalrisk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA compliance
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO signalrisk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA telemetry
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO signalrisk_app;
