# Skill: kafka-event-pipeline

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | BACKEND_NODE |
| **Category** | backend |

## Description
Kafka event pipeline for event-driven architecture.

## Patterns
- Kafka event streaming
- Dead letter queue for failed messages

## Architecture Reference
architecture#adr-002-dlq-exhausted-kafka-topic

## Constraints
- JSON Schema validation on ALL incoming events
- Dead letter queue for failed events after retries
