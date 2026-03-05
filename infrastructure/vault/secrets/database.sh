#!/usr/bin/env bash
# =============================================================================
# SignalRisk -- PostgreSQL Dynamic Credentials Engine
# =============================================================================
# Configures the Vault database secrets engine to issue short-lived PostgreSQL
# credentials for the SignalRisk application. Credentials are rotated
# automatically; no static passwords are stored anywhere.
#
# Expects:
#   - VAULT_ADDR and VAULT_TOKEN set
#   - Database engine already enabled at database/ (done by setup.sh)
#   - Environment variables for the database connection
# =============================================================================

set -euo pipefail

# -- Configuration (override via environment) ----------------------------------

DB_HOST="${SIGNALRISK_DB_HOST:-signalrisk-postgres.signalrisk.svc.cluster.local}"
DB_PORT="${SIGNALRISK_DB_PORT:-5432}"
DB_NAME="${SIGNALRISK_DB_NAME:-signalrisk}"
DB_ADMIN_USER="${SIGNALRISK_DB_ADMIN_USER:-vault_admin}"
DB_ADMIN_PASS="${SIGNALRISK_DB_ADMIN_PASS:-REPLACE_ME}"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [database] $*"; }

# -- Step 1: Configure the database connection ---------------------------------

log "Configuring PostgreSQL connection 'signalrisk-postgres' ..."

vault write database/config/signalrisk-postgres \
  plugin_name=postgresql-database-plugin \
  allowed_roles="signalrisk-app,signalrisk-readonly,signalrisk-migration" \
  connection_url="postgresql://{{username}}:{{password}}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require" \
  username="${DB_ADMIN_USER}" \
  password="${DB_ADMIN_PASS}" \
  password_authentication="scram-sha-256"

log "  Connection configured."

# -- Step 2: Rotate the root credential immediately ---------------------------
# After this, even the admin password is unknown -- Vault manages it exclusively.

log "Rotating root credentials (admin password will become Vault-managed) ..."
vault write -f database/rotate-root/signalrisk-postgres
log "  Root credentials rotated."

# -- Step 3: Create dynamic roles ---------------------------------------------

# Application role -- read/write access, short TTL
log "Creating role 'signalrisk-app' ..."
vault write database/roles/signalrisk-app \
  db_name=signalrisk-postgres \
  creation_statements="
    CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';
    GRANT CONNECT ON DATABASE ${DB_NAME} TO \"{{name}}\";
    GRANT USAGE ON SCHEMA public TO \"{{name}}\";
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO \"{{name}}\";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO \"{{name}}\";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO \"{{name}}\";
  " \
  revocation_statements="
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM \"{{name}}\";
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM \"{{name}}\";
    REVOKE USAGE ON SCHEMA public FROM \"{{name}}\";
    REVOKE CONNECT ON DATABASE ${DB_NAME} FROM \"{{name}}\";
    DROP ROLE IF EXISTS \"{{name}}\";
  " \
  default_ttl="1h" \
  max_ttl="4h"

log "  Role 'signalrisk-app' created (default_ttl=1h, max_ttl=4h)."

# Read-only role -- for dashboards, analytics, read replicas
log "Creating role 'signalrisk-readonly' ..."
vault write database/roles/signalrisk-readonly \
  db_name=signalrisk-postgres \
  creation_statements="
    CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';
    GRANT CONNECT ON DATABASE ${DB_NAME} TO \"{{name}}\";
    GRANT USAGE ON SCHEMA public TO \"{{name}}\";
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO \"{{name}}\";
  " \
  revocation_statements="
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM \"{{name}}\";
    REVOKE USAGE ON SCHEMA public FROM \"{{name}}\";
    REVOKE CONNECT ON DATABASE ${DB_NAME} FROM \"{{name}}\";
    DROP ROLE IF EXISTS \"{{name}}\";
  " \
  default_ttl="1h" \
  max_ttl="8h"

log "  Role 'signalrisk-readonly' created (default_ttl=1h, max_ttl=8h)."

# Migration role -- elevated privileges, very short TTL
log "Creating role 'signalrisk-migration' ..."
vault write database/roles/signalrisk-migration \
  db_name=signalrisk-postgres \
  creation_statements="
    CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';
    GRANT CONNECT ON DATABASE ${DB_NAME} TO \"{{name}}\";
    GRANT ALL PRIVILEGES ON SCHEMA public TO \"{{name}}\";
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"{{name}}\";
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO \"{{name}}\";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO \"{{name}}\";
  " \
  revocation_statements="
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM \"{{name}}\";
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM \"{{name}}\";
    REVOKE ALL PRIVILEGES ON SCHEMA public FROM \"{{name}}\";
    REVOKE CONNECT ON DATABASE ${DB_NAME} FROM \"{{name}}\";
    DROP ROLE IF EXISTS \"{{name}}\";
  " \
  default_ttl="15m" \
  max_ttl="30m"

log "  Role 'signalrisk-migration' created (default_ttl=15m, max_ttl=30m)."

log "PostgreSQL dynamic credentials engine configured."
