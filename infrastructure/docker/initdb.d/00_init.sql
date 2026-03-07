-- =============================================================================
-- SignalRisk — PostgreSQL Initialization Script
-- Runs once on first container start via docker-entrypoint-initdb.d
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Service-specific schemas (optional isolation)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS fraud;
CREATE SCHEMA IF NOT EXISTS compliance;
CREATE SCHEMA IF NOT EXISTS telemetry;
