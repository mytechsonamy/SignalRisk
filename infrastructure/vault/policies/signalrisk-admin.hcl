# =============================================================================
# SignalRisk -- Vault Admin Policy
# =============================================================================
# Grants full management access to SignalRisk secret engines, policies, and
# auth methods. Intended for platform/DevOps engineers -- NOT application pods.
# =============================================================================

# -----------------------------------------------------------------------------
# KV v2 -- Full CRUD on application secrets
# -----------------------------------------------------------------------------
path "signalrisk/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# -----------------------------------------------------------------------------
# Database engine -- Manage roles, connections, rotate root credentials
# -----------------------------------------------------------------------------
path "database/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Rotate the root database password
path "database/rotate-root/signalrisk-postgres" {
  capabilities = ["update"]
}

# -----------------------------------------------------------------------------
# Transit -- Manage encryption keys and perform key rotation
# -----------------------------------------------------------------------------
path "transit/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Explicitly allow key rotation
path "transit/keys/signalrisk-pii/rotate" {
  capabilities = ["update"]
}

path "transit/keys/signalrisk-fraud-data/rotate" {
  capabilities = ["update"]
}

# -----------------------------------------------------------------------------
# Policy management -- Read and update SignalRisk-scoped policies only
# -----------------------------------------------------------------------------
path "sys/policies/acl/signalrisk-*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "sys/policies/acl" {
  capabilities = ["list"]
}

# -----------------------------------------------------------------------------
# Auth methods -- Manage Kubernetes auth roles for SignalRisk
# -----------------------------------------------------------------------------
path "auth/kubernetes/role/signalrisk-*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "auth/kubernetes/role" {
  capabilities = ["list"]
}

# -----------------------------------------------------------------------------
# Leases -- Revoke / manage leases for SignalRisk secrets
# -----------------------------------------------------------------------------
path "sys/leases/lookup" {
  capabilities = ["update"]
}

path "sys/leases/revoke" {
  capabilities = ["update"]
}

path "sys/leases/revoke-prefix/database/creds/signalrisk-*" {
  capabilities = ["update"]
}

# -----------------------------------------------------------------------------
# Audit -- Read audit device configuration
# -----------------------------------------------------------------------------
path "sys/audit" {
  capabilities = ["read", "list"]
}

path "sys/audit/*" {
  capabilities = ["read"]
}

# -----------------------------------------------------------------------------
# Health & metrics
# -----------------------------------------------------------------------------
path "sys/health" {
  capabilities = ["read"]
}

path "sys/seal-status" {
  capabilities = ["read"]
}

path "sys/leader" {
  capabilities = ["read"]
}
