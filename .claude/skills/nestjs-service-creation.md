# Skill: nestjs-service-creation

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | BACKEND_NODE |
| **Category** | backend |

## Description
Creating NestJS microservices with proper module structure, dependency injection, and health checks.

## Patterns
- Use NestJS module/controller/service pattern with @Injectable() and constructor injection
- Every service exposes a health check endpoint at GET /health

## Constraints
- All services MUST include OpenTelemetry instrumentation
- Never import from other service modules directly (use events/APIs)
