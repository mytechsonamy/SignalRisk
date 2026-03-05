#!/usr/bin/env bash
# =============================================================================
# SignalRisk -- KV v2 Secret Engine Configuration
# =============================================================================
# Seeds the KV v2 engine at signalrisk/ with application secrets.
# Values below are PLACEHOLDERS -- replace them before running, or inject via
# environment variables in CI/CD.
#
# Expects:
#   - VAULT_ADDR and VAULT_TOKEN set
#   - KV v2 engine already enabled at signalrisk/ (done by setup.sh)
# =============================================================================

set -euo pipefail

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [kv] $*"; }

# -- KV v2 engine tuning ------------------------------------------------------

log "Configuring KV v2 engine settings ..."

# Set max versions to keep (for secret history / rollback)
vault kv metadata put -mount=signalrisk \
  -max-versions=10 \
  -delete-version-after=0s \
  config

# -- JWT / Auth Secrets --------------------------------------------------------

log "Writing JWT signing keys ..."
vault kv put signalrisk/auth/jwt \
  access_token_secret="${SIGNALRISK_JWT_ACCESS_SECRET:-REPLACE_WITH_ACCESS_TOKEN_SECRET}" \
  refresh_token_secret="${SIGNALRISK_JWT_REFRESH_SECRET:-REPLACE_WITH_REFRESH_TOKEN_SECRET}" \
  access_token_expiry="${SIGNALRISK_JWT_ACCESS_EXPIRY:-15m}" \
  refresh_token_expiry="${SIGNALRISK_JWT_REFRESH_EXPIRY:-7d}" \
  issuer="signalrisk-auth"

# -- API Keys (Third-Party Integrations) ---------------------------------------

log "Writing third-party API keys ..."

# Payment processor
vault kv put signalrisk/integrations/payment-processor \
  api_key="${SIGNALRISK_PAYMENT_API_KEY:-REPLACE_ME}" \
  api_secret="${SIGNALRISK_PAYMENT_API_SECRET:-REPLACE_ME}" \
  webhook_secret="${SIGNALRISK_PAYMENT_WEBHOOK_SECRET:-REPLACE_ME}" \
  environment="production"

# Fraud scoring service
vault kv put signalrisk/integrations/fraud-scoring \
  api_key="${SIGNALRISK_FRAUD_SCORING_KEY:-REPLACE_ME}" \
  api_url="${SIGNALRISK_FRAUD_SCORING_URL:-https://api.fraud-scoring.example.com/v2}" \
  timeout_ms="5000"

# Identity verification
vault kv put signalrisk/integrations/identity-verification \
  api_key="${SIGNALRISK_IDV_API_KEY:-REPLACE_ME}" \
  api_secret="${SIGNALRISK_IDV_API_SECRET:-REPLACE_ME}" \
  api_url="${SIGNALRISK_IDV_API_URL:-https://api.idv.example.com/v1}"

# Notification service (email / SMS)
vault kv put signalrisk/integrations/notifications \
  smtp_host="${SIGNALRISK_SMTP_HOST:-smtp.example.com}" \
  smtp_port="${SIGNALRISK_SMTP_PORT:-587}" \
  smtp_user="${SIGNALRISK_SMTP_USER:-REPLACE_ME}" \
  smtp_pass="${SIGNALRISK_SMTP_PASS:-REPLACE_ME}" \
  sms_api_key="${SIGNALRISK_SMS_API_KEY:-REPLACE_ME}" \
  sms_sender_id="${SIGNALRISK_SMS_SENDER:-SignalRisk}"

# -- Application Configuration ------------------------------------------------

log "Writing application configuration secrets ..."

# Redis credentials
vault kv put signalrisk/app/redis \
  host="${SIGNALRISK_REDIS_HOST:-signalrisk-redis.signalrisk.svc.cluster.local}" \
  port="${SIGNALRISK_REDIS_PORT:-6379}" \
  password="${SIGNALRISK_REDIS_PASSWORD:-REPLACE_ME}" \
  tls_enabled="true" \
  db="0"

# Internal service-to-service auth
vault kv put signalrisk/app/internal-auth \
  service_mesh_token="${SIGNALRISK_MESH_TOKEN:-REPLACE_ME}" \
  grpc_tls_cert_path="/etc/tls/service.crt" \
  grpc_tls_key_path="/etc/tls/service.key"

# Encryption keys for application-level encryption (in addition to Transit)
vault kv put signalrisk/app/encryption \
  data_at_rest_key="${SIGNALRISK_DATA_KEY:-REPLACE_WITH_32_BYTE_HEX_KEY}" \
  hmac_key="${SIGNALRISK_HMAC_KEY:-REPLACE_WITH_32_BYTE_HEX_KEY}"

# -- Feature flags / operational knobs -----------------------------------------

log "Writing operational configuration ..."

vault kv put signalrisk/app/feature-flags \
  real_time_scoring_enabled="true" \
  ml_model_version="v2.3.1" \
  risk_threshold_high="0.85" \
  risk_threshold_medium="0.55" \
  max_concurrent_evaluations="1000" \
  circuit_breaker_enabled="true"

# -- Summary -------------------------------------------------------------------

log "KV v2 secret engine populated. Secrets stored:"
vault kv list signalrisk/ 2>/dev/null || log "  (list requires appropriate policy)"

log "KV v2 configuration complete."
