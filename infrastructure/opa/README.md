# SignalRisk OPA Gatekeeper Policies

OPA Gatekeeper policies for the SignalRisk Kubernetes clusters. These policies enforce security, operational, and compliance requirements at the admission control layer.

## Directory Structure

```
infrastructure/opa/
  templates/           ConstraintTemplate CRDs (Rego logic)
  constraints/         Constraint resources (parameters and scope)
  gatekeeper-install.sh  Automated install and deploy script
```

## Policies

| Policy | Template | Constraint | Purpose |
|--------|----------|------------|---------|
| Image Allowlist | `allowed-repos-template.yaml` | `allowed-repos.yaml` | Restrict images to approved ECR registries |
| Namespace Isolation | `namespace-isolation-template.yaml` | `namespace-isolation.yaml` | Block cross-namespace secret/configmap/RBAC references |
| Required Labels | `required-labels-template.yaml` | `required-labels.yaml` | Enforce `app`, `version`, `team` labels on workloads |
| No Privileged | `no-privileged-template.yaml` | `no-privileged.yaml` | Block privileged containers and dangerous capabilities |
| Resource Limits | `resource-limits-template.yaml` | `resource-limits.yaml` | Require CPU/memory limits and requests on all containers |

## Target Namespaces

All policies apply to the six SignalRisk service namespaces:

- `signalrisk-ingestion` -- Transaction and event ingestion services
- `signalrisk-detection` -- Fraud detection engine and rule evaluation
- `signalrisk-alerting` -- Alert routing and notification services
- `signalrisk-api` -- External and internal API gateway
- `signalrisk-ml` -- ML model serving and training pipelines
- `signalrisk-data` -- Data processing and ETL workloads

## Installation

### Full install (Gatekeeper + policies)

```bash
./gatekeeper-install.sh
```

### Policies only (Gatekeeper already installed)

```bash
./gatekeeper-install.sh --skip-install
```

### Dry run (preview changes without applying)

```bash
./gatekeeper-install.sh --dry-run
```

## Customization

### ECR Registry

Update the ECR account ID in `constraints/allowed-repos.yaml` to match your AWS account:

```yaml
parameters:
  repos:
    - "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/signalrisk/"
```

### Cross-Namespace Exceptions

To allow a service namespace to reference resources in another namespace, add it to `allowedCrossNamespaceTargets` in `constraints/namespace-isolation.yaml`.

### Label Requirements

Modify the `allowedRegex` patterns in `constraints/required-labels.yaml` to adjust accepted label values.

## Verifying Policies

Check for existing violations across the cluster:

```bash
# List all constraints and their violation counts
kubectl get constraints

# Detailed violations for a specific constraint
kubectl describe signalriskallowedrepos signalrisk-allowed-repos

# Audit controller logs
kubectl logs -n gatekeeper-system -l control-plane=audit-controller --tail=100
```

Test a deployment against policies without creating it:

```bash
kubectl apply -f test-deployment.yaml --dry-run=server
```

## Enforcement Modes

All constraints default to `deny` (hard block). To switch a policy to audit-only mode during rollout, set:

```yaml
spec:
  enforcementAction: warn   # or "dryrun"
```
