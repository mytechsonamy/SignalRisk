# =============================================================================
# SignalRisk -- Vault Application Policy
# =============================================================================
# Grants read-only access to secrets required by SignalRisk application pods.
# Bound to the "signalrisk-app" Kubernetes service account via K8s auth method.
# =============================================================================

# -----------------------------------------------------------------------------
# KV v2 -- Read application secrets (JWT keys, API keys, feature flags, etc.)
# -----------------------------------------------------------------------------
path "signalrisk/data/*" {
  capabilities = ["read", "list"]
}

path "signalrisk/metadata/*" {
  capabilities = ["read", "list"]
}

# -----------------------------------------------------------------------------
# Database -- Generate dynamic PostgreSQL credentials
# -----------------------------------------------------------------------------
path "database/creds/signalrisk-app" {
  capabilities = ["read"]
}

# Renew leases on database credentials
path "sys/leases/renew" {
  capabilities = ["update"]
}

# Look up own token capabilities (health checks)
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

# Renew own token
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# -----------------------------------------------------------------------------
# Transit -- Encrypt/decrypt sensitive data (PII, card numbers, etc.)
# -----------------------------------------------------------------------------
path "transit/encrypt/signalrisk-pii" {
  capabilities = ["update"]
}

path "transit/decrypt/signalrisk-pii" {
  capabilities = ["update"]
}

path "transit/encrypt/signalrisk-fraud-data" {
  capabilities = ["update"]
}

path "transit/decrypt/signalrisk-fraud-data" {
  capabilities = ["update"]
}

# Read encryption key metadata (rotation info), but not the key material
path "transit/keys/signalrisk-pii" {
  capabilities = ["read"]
}

path "transit/keys/signalrisk-fraud-data" {
  capabilities = ["read"]
}
