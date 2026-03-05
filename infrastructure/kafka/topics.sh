#!/usr/bin/env bash
###############################################################################
# SignalRisk — Kafka Topic Provisioning
#
# Creates all SignalRisk event stream topics with 48 partitions on the MSK
# cluster. Requires BOOTSTRAP_SERVERS to be set or passed as the first arg.
#
# Usage:
#   ./topics.sh <bootstrap-servers>
#   BOOTSTRAP_SERVERS=broker1:9094,broker2:9094 ./topics.sh
#
# Prerequisites:
#   - Apache Kafka CLI tools (kafka-topics.sh) on PATH
#   - Network access to the MSK cluster (TLS on port 9094)
#   - TLS client properties file (optional, defaults to ./client.properties)
###############################################################################

set -euo pipefail

BOOTSTRAP="${1:-${BOOTSTRAP_SERVERS:-}}"
if [[ -z "$BOOTSTRAP" ]]; then
  echo "ERROR: Bootstrap servers not provided."
  echo "Usage: $0 <bootstrap-servers>"
  echo "   or: BOOTSTRAP_SERVERS=host:9094 $0"
  exit 1
fi

CLIENT_PROPS="${CLIENT_PROPERTIES:-$(dirname "$0")/client.properties}"
PARTITIONS=48
REPLICATION_FACTOR=3

# Common Kafka CLI flags
KAFKA_OPTS=(
  --bootstrap-server "$BOOTSTRAP"
  --command-config "$CLIENT_PROPS"
)

# Helper: create a topic if it does not already exist
create_topic() {
  local topic="$1"
  shift
  local config_flags=("$@")

  echo "Creating topic: $topic (partitions=$PARTITIONS, rf=$REPLICATION_FACTOR)"

  kafka-topics.sh "${KAFKA_OPTS[@]}" \
    --create \
    --if-not-exists \
    --topic "$topic" \
    --partitions "$PARTITIONS" \
    --replication-factor "$REPLICATION_FACTOR" \
    "${config_flags[@]}"
}

###############################################################################
# Topic Definitions
###############################################################################

echo "============================================="
echo " SignalRisk — Kafka Topic Provisioning"
echo " Bootstrap: $BOOTSTRAP"
echo " Partitions: $PARTITIONS | RF: $REPLICATION_FACTOR"
echo "============================================="
echo ""

# 1. Main event stream — all incoming transaction/signal events
create_topic "signalrisk.events.raw" \
  --config retention.ms=604800000 \
  --config cleanup.policy=delete \
  --config min.insync.replicas=2 \
  --config compression.type=lz4 \
  --config segment.bytes=1073741824

# 2. Dead letter queue — events that failed processing
create_topic "signalrisk.events.dlq" \
  --config retention.ms=2592000000 \
  --config cleanup.policy=delete \
  --config min.insync.replicas=2 \
  --config compression.type=lz4 \
  --config segment.bytes=536870912

# 3. Decision events — fraud/legitimate verdicts
create_topic "signalrisk.decisions" \
  --config retention.ms=2592000000 \
  --config cleanup.policy=delete \
  --config min.insync.replicas=2 \
  --config compression.type=lz4 \
  --config segment.bytes=1073741824

# 4. Rule update notifications (compacted)
create_topic "signalrisk.rules.changes" \
  --config retention.ms=-1 \
  --config cleanup.policy=compact \
  --config min.insync.replicas=2 \
  --config compression.type=lz4 \
  --config min.cleanable.dirty.ratio=0.5 \
  --config delete.retention.ms=86400000

# 5. Async telco enrichment
create_topic "signalrisk.enrichment.telco" \
  --config retention.ms=86400000 \
  --config cleanup.policy=delete \
  --config min.insync.replicas=2 \
  --config compression.type=lz4 \
  --config segment.bytes=536870912

# 6. Case creation events
create_topic "signalrisk.cases" \
  --config retention.ms=2592000000 \
  --config cleanup.policy=delete \
  --config min.insync.replicas=2 \
  --config compression.type=lz4 \
  --config segment.bytes=536870912

# 7. Webhook delivery
create_topic "signalrisk.webhooks" \
  --config retention.ms=259200000 \
  --config cleanup.policy=delete \
  --config min.insync.replicas=2 \
  --config compression.type=lz4 \
  --config segment.bytes=268435456

# 8. Consent change events (compacted)
create_topic "signalrisk.consent" \
  --config retention.ms=-1 \
  --config cleanup.policy=compact \
  --config min.insync.replicas=2 \
  --config compression.type=lz4 \
  --config min.cleanable.dirty.ratio=0.3 \
  --config delete.retention.ms=604800000

echo ""
echo "============================================="
echo " All topics created successfully."
echo "============================================="

# List all signalrisk topics for verification
echo ""
echo "Verifying topics:"
kafka-topics.sh "${KAFKA_OPTS[@]}" --list | grep "^signalrisk\." || true
