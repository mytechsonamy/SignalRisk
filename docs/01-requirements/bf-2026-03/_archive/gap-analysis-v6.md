# SignalRisk v2 — Brownfield Gap Analysis Requirements (Revision 6)
# STATUS: REJECTED — superseded by v7 (deleted user → 401, DLQ Kafka topic, polling sequential)

> Key changes from v5: P0.3 deleted user throws 401 (no fallback to 'merchant'), BC-002 per-feature toggles with explicit defaults, P3.2 DLQ exhausted → Kafka topic + in-memory cache capped at 1000 FIFO, sequential KPI polling (setTimeout in finally), visibilitychange trigger, stale badge distinguishes Offline vs Stale.

See gap-analysis-v7.md for the final approved version.
