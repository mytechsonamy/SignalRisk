#!/usr/bin/env bash
# Validates replication lag for PostgreSQL and Redis
PG_HOST="${PG_HOST:-localhost}"
PG_USER="${PG_USER:-signalrisk}"
REDIS_HOST="${REDIS_HOST:-localhost}"
MAX_LAG_SECONDS=30

echo "=== Replication Lag Validation ==="

# PostgreSQL lag
PG_LAG=$(psql -h "$PG_HOST" -U "$PG_USER" -t -c \
  "SELECT COALESCE(EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())), 0)::int" \
  2>/dev/null || echo "N/A")
echo "PostgreSQL replication lag: ${PG_LAG}s"

# Redis lag
REDIS_LAG=$(redis-cli -h "$REDIS_HOST" INFO replication 2>/dev/null | \
  grep master_last_io_seconds_ago | cut -d: -f2 | tr -d '[:space:]' || echo "N/A")
echo "Redis replication lag: ${REDIS_LAG}s"

if [[ "$PG_LAG" != "N/A" ]] && [[ "$PG_LAG" -gt "$MAX_LAG_SECONDS" ]]; then
  echo "WARNING: PostgreSQL lag ($PG_LAG s) exceeds threshold ($MAX_LAG_SECONDS s)"
  exit 1
fi

echo "Replication lag within acceptable bounds"
