# Skill: docker-kubernetes

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | DEVOPS |
| **Category** | infrastructure |

## Description
Docker containerization and Kubernetes (EKS) deployment for SignalRisk services. Covers Dockerfiles, Helm charts, ArgoCD GitOps, HPA auto-scaling, and multi-AZ deployment.

## Patterns
- Multi-stage Dockerfile: build -> prune -> production (minimal image)
- Docker Compose for local development (all services + dependencies)
- EKS multi-AZ deployment with HPA per service
- ArgoCD GitOps: changes merged to main automatically deploy to staging
- Helm charts per service with environment-specific values
- Health check probes: liveness (/health), readiness (/ready)
- Resource limits: CPU/memory defined per service based on profiling

## Code Examples
```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3002
USER node
CMD ["node", "dist/main.js"]
```

```yaml
# HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: device-intel-service
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: device-intel-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## Constraints
- All images MUST run as non-root user
- Trivy image scanning in CI -- zero critical vulnerabilities
- Health probes: liveness at /health, readiness at /ready (separate endpoints)
- PgBouncer sidecar for database connection pooling
- Secrets from Vault -- NEVER bake secrets into images or Helm values
- Canary rollout strategy for production deployments
