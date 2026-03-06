# SignalRisk Production Go-Live Checklist

## Infrastructure
- [ ] Kubernetes cluster (>=3 nodes, 16 CPU / 64GB RAM total)
- [ ] All 13 services deployed and healthy (kubectl get pods -n signalrisk-production)
- [ ] PodDisruptionBudgets verified (kubectl get pdb -n signalrisk-production)
- [ ] HPA configured for all services (min: 2 replicas)
- [ ] Node autoscaler configured
- [ ] Persistent volumes provisioned for PostgreSQL and Neo4j
- [ ] Storage class with snapshot support configured
- [ ] Ingress controller with TLS termination deployed
- [ ] DNS records configured (api.signalrisk.com, dashboard.signalrisk.com)
- [ ] TLS certificates valid and auto-renewing (cert-manager)

## Security
- [ ] All secrets in Kubernetes Secrets (not ConfigMaps)
- [ ] JWT RS256 private key rotated from default
- [ ] API key hashing uses bcrypt (not plaintext)
- [ ] CORS origins restricted to production domains
- [ ] WAF rules enabled for OWASP Top 10
- [ ] Network policies applied (deny-all default, allow explicit)
- [ ] RBAC configured (no cluster-admin service accounts)
- [ ] Image vulnerability scan passed (no CRITICAL CVEs)
- [ ] Secrets scanning on all recent commits passed
- [ ] Pen test completed and critical findings remediated

## Database
- [ ] PostgreSQL HA with streaming replication (1 primary, 2 replicas)
- [ ] All migrations applied (db-migrations/ 001-008)
- [ ] RLS policies enabled on all tenant tables
- [ ] Connection pooling configured (PgBouncer, max 100 per service)
- [ ] Backup schedule verified (hourly snapshots, 30-day retention)
- [ ] Point-in-time recovery tested
- [ ] Neo4j cluster deployed (3 nodes)
- [ ] Redis cluster (6 nodes: 3 primary + 3 replica)
- [ ] Redis maxmemory-policy set to allkeys-lru
- [ ] Kafka cluster (3 brokers, replication factor 3)

## Observability
- [ ] Prometheus scraping all 13 services
- [ ] Grafana dashboards imported (fraud-overview, decision-latency, kafka-lag)
- [ ] Alert rules deployed (decision-latency-alerts.yaml, kafka-lag-alerts.yaml)
- [ ] PagerDuty/Slack alert routing configured
- [ ] Jaeger distributed tracing collecting spans
- [ ] Log aggregation (Loki or ELK) receiving logs from all pods
- [ ] Uptime monitoring configured (external, 1-min checks)
- [ ] SLA dashboard visible to operations team

## Compliance
- [ ] PCI-DSS SAQ A-EP completed and signed
- [ ] GDPR DPA signed with all sub-processors
- [ ] Art. 30 RoPA filed and approved
- [ ] Data retention policies active (DataRetentionService cron running)
- [ ] Right-to-erasure endpoint tested (POST /v1/merchants/:id/purge)
- [ ] Compliance cross-reference check passing (scripts/compliance-check.sh)
- [ ] Security controls matrix reviewed by security team
- [ ] Audit log retention >= 12 months configured

## Load & Performance
- [ ] Load test completed at 5K events/sec (p99 < 100ms)
- [ ] Decision p99 latency baseline recorded
- [ ] Kafka consumer lag < 100 at peak load
- [ ] Redis hit rate > 80% for decision cache

## Rollback Plan
- [ ] ArgoCD production rollback tested (argocd app rollback signalrisk-production)
- [ ] Database rollback procedure documented and tested
- [ ] Rollback RTO < 5 minutes verified
