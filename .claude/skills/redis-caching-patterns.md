# Skill: redis-caching-patterns

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | BACKEND_NODE |
| **Category** | backend |

## Description
Redis caching patterns for feature store, counters, and session data.

## Patterns
- Set TTL on ALL keys to prevent unbounded growth

## Constraints
- Set TTL on ALL keys -- no unbounded growth
- Use pipelined operations for batch reads
- Graceful degradation when Redis is unavailable
