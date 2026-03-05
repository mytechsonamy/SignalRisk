#!/usr/bin/env bash
# =============================================================================
# SignalRisk -- Vault Initialization & Configuration
# =============================================================================
# Idempotent script that:
#   1. Waits for Vault to be reachable
#   2. Initializes (if needed) and unseals Vault
#   3. Enables secret engines (KV v2, Database, Transit)
#   4. Writes application and admin policies
#   5. Configures Kubernetes auth method
#   6. Enables audit logging
#
# Prerequisites:
#   - VAULT_ADDR is set (e.g. https://vault.signalrisk.internal:8200)
#   - vault CLI is on PATH
#   - kubectl access to the target EKS cluster
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

VAULT_ADDR="${VAULT_ADDR:-https://127.0.0.1:8200}"
VAULT_NAMESPACE="${VAULT_NAMESPACE:-signalrisk}"
K8S_NAMESPACE="${K8S_NAMESPACE:-signalrisk}"
VAULT_KEY_SHARES="${VAULT_KEY_SHARES:-5}"
VAULT_KEY_THRESHOLD="${VAULT_KEY_THRESHOLD:-3}"
INIT_OUTPUT_FILE="${INIT_OUTPUT_FILE:-/tmp/vault-init-keys.json}"

export VAULT_ADDR

# -- Helpers -------------------------------------------------------------------

log()  { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }
die()  { log "ERROR: $*" >&2; exit 1; }

wait_for_vault() {
  log "Waiting for Vault at ${VAULT_ADDR} ..."
  local retries=30
  while ! vault status -format=json 2>/dev/null | grep -q '"initialized"'; do
    retries=$((retries - 1))
    [[ $retries -le 0 ]] && die "Vault not reachable after 30 attempts"
    sleep 2
  done
  log "Vault is reachable."
}

# -- Step 1: Initialize -------------------------------------------------------

initialize_vault() {
  local status
  status=$(vault status -format=json 2>/dev/null || true)

  if echo "$status" | grep -q '"initialized":false'; then
    log "Initializing Vault (shares=${VAULT_KEY_SHARES}, threshold=${VAULT_KEY_THRESHOLD}) ..."
    vault operator init \
      -key-shares="${VAULT_KEY_SHARES}" \
      -key-threshold="${VAULT_KEY_THRESHOLD}" \
      -format=json > "${INIT_OUTPUT_FILE}"

    log "Init keys written to ${INIT_OUTPUT_FILE} -- store these securely and DELETE this file."
  else
    log "Vault already initialized."
  fi
}

# -- Step 2: Unseal (only needed when NOT using auto-unseal) -------------------

unseal_vault() {
  local sealed
  sealed=$(vault status -format=json 2>/dev/null | jq -r '.sealed')

  if [[ "$sealed" == "true" ]]; then
    log "Vault is sealed. Attempting unseal via init output ..."
    if [[ ! -f "${INIT_OUTPUT_FILE}" ]]; then
      die "Vault is sealed but no init keys found at ${INIT_OUTPUT_FILE}."
    fi

    local i=0
    while [[ $i -lt ${VAULT_KEY_THRESHOLD} ]]; do
      local key
      key=$(jq -r ".unseal_keys_b64[$i]" "${INIT_OUTPUT_FILE}")
      vault operator unseal "$key" > /dev/null
      i=$((i + 1))
    done
    log "Vault unsealed."
  else
    log "Vault is already unsealed (or using auto-unseal)."
  fi
}

# -- Step 3: Authenticate -----------------------------------------------------

authenticate() {
  if [[ -f "${INIT_OUTPUT_FILE}" ]]; then
    local root_token
    root_token=$(jq -r '.root_token' "${INIT_OUTPUT_FILE}")
    export VAULT_TOKEN="$root_token"
    log "Authenticated with root token from init output."
  elif [[ -n "${VAULT_TOKEN:-}" ]]; then
    log "Using VAULT_TOKEN from environment."
  else
    die "No authentication token available. Set VAULT_TOKEN or provide init output."
  fi
}

# -- Step 4: Enable secret engines --------------------------------------------

enable_secret_engines() {
  log "Enabling secret engines ..."

  # KV v2
  if ! vault secrets list -format=json | jq -e '."signalrisk/"' > /dev/null 2>&1; then
    vault secrets enable -path=signalrisk -version=2 kv
    log "  KV v2 engine enabled at signalrisk/"
  else
    log "  KV v2 engine already enabled at signalrisk/"
  fi

  # Database
  if ! vault secrets list -format=json | jq -e '."database/"' > /dev/null 2>&1; then
    vault secrets enable database
    log "  Database engine enabled at database/"
  else
    log "  Database engine already enabled at database/"
  fi

  # Transit (encryption-as-a-service for PII / fraud data)
  if ! vault secrets list -format=json | jq -e '."transit/"' > /dev/null 2>&1; then
    vault secrets enable transit
    log "  Transit engine enabled at transit/"
  else
    log "  Transit engine already enabled at transit/"
  fi
}

# -- Step 5: Create transit encryption keys -----------------------------------

create_transit_keys() {
  log "Creating transit encryption keys ..."

  for key_name in signalrisk-pii signalrisk-fraud-data; do
    if ! vault read "transit/keys/${key_name}" > /dev/null 2>&1; then
      vault write -f "transit/keys/${key_name}" \
        type=aes256-gcm96 \
        auto_rotate_period=720h  # 30 days
      log "  Transit key '${key_name}' created with 30-day auto-rotation."
    else
      log "  Transit key '${key_name}' already exists."
    fi
  done
}

# -- Step 6: Write policies ---------------------------------------------------

write_policies() {
  log "Writing Vault policies ..."

  vault policy write signalrisk-app "${SCRIPT_DIR}/policies/signalrisk-app.hcl"
  log "  Policy 'signalrisk-app' written."

  vault policy write signalrisk-admin "${SCRIPT_DIR}/policies/signalrisk-admin.hcl"
  log "  Policy 'signalrisk-admin' written."
}

# -- Step 7: Configure Kubernetes auth ----------------------------------------

configure_k8s_auth() {
  log "Configuring Kubernetes auth method ..."

  if ! vault auth list -format=json | jq -e '."kubernetes/"' > /dev/null 2>&1; then
    vault auth enable kubernetes
    log "  Kubernetes auth method enabled."
  else
    log "  Kubernetes auth method already enabled."
  fi

  # Retrieve the K8s API server info from the running cluster
  local k8s_host
  k8s_host=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')

  local sa_token
  sa_token=$(kubectl get secret vault-auth-secret \
    -n "${K8S_NAMESPACE}" \
    -o jsonpath='{.data.token}' | base64 -d)

  local k8s_ca_cert
  k8s_ca_cert=$(kubectl get secret vault-auth-secret \
    -n "${K8S_NAMESPACE}" \
    -o jsonpath='{.data.ca\.crt}' | base64 -d)

  vault write auth/kubernetes/config \
    kubernetes_host="${k8s_host}" \
    token_reviewer_jwt="${sa_token}" \
    kubernetes_ca_cert="${k8s_ca_cert}" \
    disable_local_ca_jwt=true

  log "  Kubernetes auth config written."

  # Create role for application pods
  vault write auth/kubernetes/role/signalrisk-app \
    bound_service_account_names=signalrisk-vault-auth \
    bound_service_account_namespaces="${K8S_NAMESPACE}" \
    policies=signalrisk-app \
    ttl=1h \
    max_ttl=4h

  log "  Kubernetes role 'signalrisk-app' created."

  # Create role for admin operations (CI/CD pipelines, platform engineers)
  vault write auth/kubernetes/role/signalrisk-admin \
    bound_service_account_names=signalrisk-vault-admin \
    bound_service_account_namespaces="${K8S_NAMESPACE}" \
    policies=signalrisk-admin \
    ttl=30m \
    max_ttl=2h

  log "  Kubernetes role 'signalrisk-admin' created."
}

# -- Step 8: Enable audit logging ---------------------------------------------

enable_audit() {
  log "Enabling audit logging ..."

  if ! vault audit list -format=json | jq -e '."file/"' > /dev/null 2>&1; then
    vault audit enable file file_path=/vault/audit/vault-audit.log
    log "  File audit device enabled at /vault/audit/vault-audit.log"
  else
    log "  File audit device already enabled."
  fi
}

# -- Step 9: Run secret engine configuration scripts --------------------------

configure_secret_engines() {
  log "Running secret engine configuration scripts ..."

  if [[ -x "${SCRIPT_DIR}/secrets/database.sh" ]]; then
    bash "${SCRIPT_DIR}/secrets/database.sh"
  fi

  if [[ -x "${SCRIPT_DIR}/secrets/kv.sh" ]]; then
    bash "${SCRIPT_DIR}/secrets/kv.sh"
  fi
}

# -- Main ----------------------------------------------------------------------

main() {
  log "=== SignalRisk Vault Setup ==="
  log "VAULT_ADDR=${VAULT_ADDR}"

  wait_for_vault
  initialize_vault
  unseal_vault
  authenticate
  enable_secret_engines
  create_transit_keys
  write_policies
  configure_k8s_auth
  enable_audit
  configure_secret_engines

  log "=== Vault setup complete ==="
}

main "$@"
