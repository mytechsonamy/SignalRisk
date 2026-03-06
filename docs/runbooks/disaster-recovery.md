# SignalRisk Disaster Recovery Runbook

## Overview
- RTO: 15 minutes | RPO: 60 seconds
- Primary Region: us-east-1 | Standby Region: eu-west-1
- Last tested: 2026-03-06 | Next test: 2026-06-06

## Architecture

### Stateful Components (require data sync)
| Component | Technology | Replication | RPO |
|-----------|-----------|-------------|-----|
| Application DB | RDS PostgreSQL Multi-AZ | Cross-region read replica (async) | ~60s |
| Cache | ElastiCache Redis | Global Datastore | ~1s |
| Message bus | MSK Kafka | MirrorMaker 2 | ~5s |
| Graph DB | Neo4j | Causal Cluster (3 nodes) | ~1s |

### Stateless Components (redeploy from images)
All 13 NestJS services — auth, event-collector, device-intel, velocity, behavioral,
network-intel, telco-intel, decision, case, webhook, graph-intel, rule-engine,
feature-flag — are stateless and can be redeployed in standby region from
the same Docker images in GHCR.

## Failover Decision Tree

```
Alert Triggered
     |
     +- Infra failure (AZ/region outage)? --YES--> Automated failover (PagerDuty runbook)
     |
     +- Data corruption detected? ----------YES--> Human approval required -> Step 5
     |
     +- Partial service degradation? -----------> Scale horizontally first (HPA)
```

## Failover Procedure

### Step 1: Detect (T+0)
- CloudWatch alarm: `SignalRisk-RegionHealth` triggers if >3 services unhealthy for 5 min
- PagerDuty alert sent to on-call engineer
- Run: `./scripts/dr/health-check.sh https://api.signalrisk.io`

### Step 2: Promote RDS Read Replica (T+2 min)
```bash
aws rds promote-read-replica \
  --db-instance-identifier signalrisk-eu-west-1-replica \
  --region eu-west-1
# Wait for status=available (~2-5 min)
aws rds wait db-instance-available \
  --db-instance-identifier signalrisk-eu-west-1-replica \
  --region eu-west-1
```

### Step 3: Update Service Configuration (T+5 min)
Update Kubernetes secrets in eu-west-1 cluster:
```bash
kubectl set env deployment/auth-service \
  DATABASE_URL=postgresql://signalrisk-eu-west-1-replica.xxx.eu-west-1.rds.amazonaws.com:5432/signalrisk \
  REDIS_HOST=signalrisk-global.cache.amazonaws.com \
  --namespace=signalrisk
# Repeat for all 13 services
```

### Step 4: Deploy Services to Standby Region (T+7 min)
```bash
kubectl apply -f infrastructure/k8s/ --namespace=signalrisk \
  --context=eu-west-1-cluster
```
Images already in GHCR — no build needed.

### Step 5: Verify Health (T+12 min)
```bash
./scripts/dr/health-check.sh https://eu.api.signalrisk.io
# Expected: all 13 services PASS
```

### Step 6: Update DNS Failover (T+13 min)
```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id ZXXXXX \
  --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"api.signalrisk.io","Type":"A","AliasTarget":{"HostedZoneId":"ZYYYY","DNSName":"eu-alb.eu-west-1.elb.amazonaws.com","EvaluateTargetHealth":true}}}]}'
```

### Step 7: Communicate (T+15 min)
- Update status page (status.signalrisk.io)
- Notify enterprise customers via webhook (POST /internal/sla-breach with type=region_failover)

## Rollback Procedure

1. Sync data back: wait for us-east-1 replica to catch up
2. Verify lag: `./scripts/dr/validate-replication-lag.sh`
3. Switch DNS back to us-east-1
4. Redeploy services in us-east-1 with primary DB endpoint
5. Demote eu-west-1 back to read replica

## DR Test Schedule
- Quarterly tabletop exercise
- Semi-annual live failover test (maintenance window)
- Monthly automated health check validation
