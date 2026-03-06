# SignalRisk On-Call Playbook

## Alert Reference

### Kafka Consumer Lag > 10K events
- **Severity:** P2
- **Impact:** Delayed fraud decisions (>10s latency)
- **Actions:**
  1. `kubectl scale deployment event-collector --replicas=6`
  2. Check Kafka topic partition count: `kafka-topics.sh --describe --topic events`
  3. If lag still growing: increase partitions (requires coordination)
- **Escalate to:** Backend lead if lag exceeds 100K

### Redis Memory > 80%
- **Severity:** P2
- **Actions:**
  1. Check TTLs: `redis-cli TTL rate:* | sort -n | head -20`
  2. Force eviction: ensure maxmemory-policy=allkeys-lru
  3. Increase ElastiCache node size if persistent
- **Escalate to:** Infrastructure team

### PostgreSQL Connection Pool Exhaustion
- **Severity:** P1
- **Actions:**
  1. Check active connections: `SELECT count(*) FROM pg_stat_activity`
  2. Kill idle connections: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='idle' AND query_start < NOW() - INTERVAL '5 min'`
  3. Restart affected services to reset pools
- **Escalate to:** DBA on-call

### Service OOM (Pod Restart Loop)
- **Severity:** P2
- **Actions:**
  1. `kubectl describe pod <pod-name>` — check OOMKilled status
  2. Increase memory limit in deployment YAML
  3. Check for memory leak: review recent deployments
- **Escalate to:** Service owner

## Escalation Matrix
| Severity | Response Time | Escalate After |
|----------|--------------|----------------|
| P1 | 15 min | 30 min |
| P2 | 1 hour | 4 hours |
| P3 | Next business day | — |
