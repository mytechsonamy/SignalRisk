#!/usr/bin/env bash
#
# gatekeeper-install.sh
# Installs OPA Gatekeeper on an EKS cluster and applies SignalRisk policies.
#
# Prerequisites:
#   - kubectl configured with the target EKS cluster context
#   - Helm 3 installed
#   - Sufficient RBAC permissions (cluster-admin or equivalent)
#
# Usage:
#   ./gatekeeper-install.sh [--dry-run] [--skip-install]
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATEKEEPER_VERSION="v3.15.1"
GATEKEEPER_NAMESPACE="gatekeeper-system"
DRY_RUN=""
SKIP_INSTALL=false

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN="--dry-run=server"
      echo "[INFO] Dry-run mode enabled. No changes will be persisted."
      ;;
    --skip-install)
      SKIP_INSTALL=true
      echo "[INFO] Skipping Gatekeeper installation, applying policies only."
      ;;
    *)
      echo "[ERROR] Unknown argument: $arg"
      echo "Usage: $0 [--dry-run] [--skip-install]"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
echo "========================================"
echo " SignalRisk OPA Gatekeeper Installer"
echo "========================================"

echo "[1/6] Verifying prerequisites..."

if ! command -v kubectl &>/dev/null; then
  echo "[ERROR] kubectl not found. Install it first."
  exit 1
fi

if ! command -v helm &>/dev/null; then
  echo "[ERROR] helm not found. Install Helm 3 first."
  exit 1
fi

CONTEXT=$(kubectl config current-context 2>/dev/null || true)
if [ -z "$CONTEXT" ]; then
  echo "[ERROR] No active kubectl context. Configure your kubeconfig for the target EKS cluster."
  exit 1
fi
echo "  Active context: $CONTEXT"

# Safety check: confirm the cluster
read -rp "  Deploy Gatekeeper policies to cluster '$CONTEXT'? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "[ABORT] Cancelled by user."
  exit 0
fi

# ---------------------------------------------------------------------------
# Install Gatekeeper via Helm
# ---------------------------------------------------------------------------
if [ "$SKIP_INSTALL" = false ]; then
  echo ""
  echo "[2/6] Installing OPA Gatekeeper ${GATEKEEPER_VERSION}..."

  helm repo add gatekeeper https://open-policy-agent.github.io/gatekeeper/charts 2>/dev/null || true
  helm repo update gatekeeper

  helm upgrade --install gatekeeper gatekeeper/gatekeeper \
    --namespace "$GATEKEEPER_NAMESPACE" \
    --create-namespace \
    --version "${GATEKEEPER_VERSION#v}" \
    --set replicas=3 \
    --set audit.replicas=2 \
    --set audit.logLevel=INFO \
    --set controllerManager.logLevel=INFO \
    --set psp.enabled=false \
    --wait \
    --timeout 5m \
    $DRY_RUN

  echo "  Gatekeeper installed successfully."
else
  echo ""
  echo "[2/6] Skipping Gatekeeper install (--skip-install)."
fi

# ---------------------------------------------------------------------------
# Wait for Gatekeeper to be ready
# ---------------------------------------------------------------------------
echo ""
echo "[3/6] Waiting for Gatekeeper webhook to become ready..."

if [ -z "$DRY_RUN" ] && [ "$SKIP_INSTALL" = false ]; then
  kubectl rollout status deployment/gatekeeper-controller-manager \
    -n "$GATEKEEPER_NAMESPACE" --timeout=120s
  kubectl rollout status deployment/gatekeeper-audit \
    -n "$GATEKEEPER_NAMESPACE" --timeout=120s
  echo "  Gatekeeper is ready."
else
  echo "  Skipped (dry-run or skip-install mode)."
fi

# ---------------------------------------------------------------------------
# Apply ConstraintTemplates
# ---------------------------------------------------------------------------
echo ""
echo "[4/6] Applying ConstraintTemplates..."

for template in "$SCRIPT_DIR"/templates/*.yaml; do
  echo "  Applying: $(basename "$template")"
  kubectl apply -f "$template" $DRY_RUN
done

# Wait for templates to be established
if [ -z "$DRY_RUN" ]; then
  echo "  Waiting 10s for CRDs to propagate..."
  sleep 10
fi

# ---------------------------------------------------------------------------
# Apply Constraints
# ---------------------------------------------------------------------------
echo ""
echo "[5/6] Applying Constraints..."

for constraint in "$SCRIPT_DIR"/constraints/*.yaml; do
  echo "  Applying: $(basename "$constraint")"
  kubectl apply -f "$constraint" $DRY_RUN
done

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------
echo ""
echo "[6/6] Verifying policy deployment..."

if [ -z "$DRY_RUN" ]; then
  echo ""
  echo "  ConstraintTemplates:"
  kubectl get constrainttemplates -o custom-columns="NAME:.metadata.name,CREATED:.metadata.creationTimestamp"
  echo ""
  echo "  Constraints:"
  kubectl get constraints -o custom-columns="KIND:.kind,NAME:.metadata.name,ENFORCEMENT:.spec.enforcementAction,VIOLATIONS:.status.totalViolations"
else
  echo "  Skipped verification (dry-run mode)."
fi

echo ""
echo "========================================"
echo " OPA Gatekeeper deployment complete."
echo "========================================"
echo ""
echo "Next steps:"
echo "  - Review constraint violations:  kubectl get constraints -o yaml"
echo "  - Check audit results:           kubectl logs -n $GATEKEEPER_NAMESPACE -l control-plane=audit-controller"
echo "  - Test a policy:                 kubectl apply -f <test-pod.yaml> --dry-run=server"
