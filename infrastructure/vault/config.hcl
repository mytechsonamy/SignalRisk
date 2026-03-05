# =============================================================================
# SignalRisk -- HashiCorp Vault Server Configuration
# =============================================================================
# Production-grade Vault config for dynamic secrets, key rotation, and audit.
# Designed to run on EKS with integrated storage (Raft) and AWS KMS auto-unseal.
# =============================================================================

# -----------------------------------------------------------------------------
# Storage Backend -- Integrated Raft storage (HA-capable, no external deps)
# -----------------------------------------------------------------------------
storage "raft" {
  path    = "/vault/data"
  node_id = "signalrisk-vault-0"

  retry_join {
    leader_api_addr         = "https://signalrisk-vault-0.vault-internal:8200"
    leader_ca_cert_file     = "/vault/tls/ca.crt"
    leader_client_cert_file = "/vault/tls/tls.crt"
    leader_client_key_file  = "/vault/tls/tls.key"
  }

  retry_join {
    leader_api_addr         = "https://signalrisk-vault-1.vault-internal:8200"
    leader_ca_cert_file     = "/vault/tls/ca.crt"
    leader_client_cert_file = "/vault/tls/tls.crt"
    leader_client_key_file  = "/vault/tls/tls.key"
  }

  retry_join {
    leader_api_addr         = "https://signalrisk-vault-2.vault-internal:8200"
    leader_ca_cert_file     = "/vault/tls/ca.crt"
    leader_client_cert_file = "/vault/tls/tls.crt"
    leader_client_key_file  = "/vault/tls/tls.key"
  }
}

# -----------------------------------------------------------------------------
# Listener -- HTTPS with TLS
# -----------------------------------------------------------------------------
listener "tcp" {
  address       = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"

  tls_cert_file = "/vault/tls/tls.crt"
  tls_key_file  = "/vault/tls/tls.key"
  tls_client_ca_file = "/vault/tls/ca.crt"

  # Telemetry for Prometheus scraping
  telemetry {
    unauthenticated_metrics_access = true
  }
}

# -----------------------------------------------------------------------------
# Seal -- AWS KMS auto-unseal (eliminates manual unseal on pod restart)
# -----------------------------------------------------------------------------
seal "awskms" {
  region     = "us-east-1"
  kms_key_id = "REPLACE_WITH_KMS_KEY_ID"

  # The IAM role attached to the EKS pod provides credentials via IRSA;
  # no static AWS keys are stored here.
}

# -----------------------------------------------------------------------------
# Telemetry -- Prometheus metrics endpoint
# -----------------------------------------------------------------------------
telemetry {
  prometheus_retention_time = "24h"
  disable_hostname          = true
}

# -----------------------------------------------------------------------------
# Audit -- File-based audit log (stdout in containers, shipped via FluentBit)
# -----------------------------------------------------------------------------
# Enabled programmatically in setup.sh so Vault is already initialized first.

# -----------------------------------------------------------------------------
# General settings
# -----------------------------------------------------------------------------
api_addr     = "https://signalrisk-vault-active.vault.svc.cluster.local:8200"
cluster_addr = "https://$(POD_NAME).vault-internal:8201"
cluster_name = "signalrisk-vault"

ui            = true
disable_mlock = true   # Required when running in containers without IPC_LOCK

default_lease_ttl = "1h"
max_lease_ttl     = "24h"
