# Skill: nestjs-service-creation

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | BACKEND_NODE |
| **Category** | backend |

## Description
Creating NestJS microservices for the SignalRisk platform. Each service follows a consistent module structure with dependency injection, health checks, and OpenTelemetry instrumentation.

## Patterns
- Each service is a standalone NestJS application in `apps/{service-name}/`
- Use NestJS module/controller/service pattern with `@Injectable()` and constructor injection
- Every service exposes a health check endpoint at `GET /health`
- AsyncLocalStorage for tenant context propagation (set via middleware, used in all DB queries)
- Transactional outbox pattern for Kafka publishes (no dual-write)
- Idempotent consumers: dedup via `event_id` in `processed_events` table
- All services use shared `packages/` for signal contracts and common utilities

## Architecture Reference
architecture-v3.md#2-service-architecture

## Code Examples
```typescript
// Service module structure
@Module({
  imports: [
    PrismaModule,
    KafkaModule,
    RedisModule,
    HealthModule,
    TelemetryModule,
  ],
  controllers: [DeviceIntelController],
  providers: [
    DeviceIntelService,
    FingerprintService,
    ReputationService,
  ],
})
export class DeviceIntelModule {}

// Tenant-aware service
@Injectable()
export class DeviceIntelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getDeviceReputation(deviceId: string): Promise<DeviceSignals> {
    const merchantId = this.tenantContext.getMerchantId();
    // RLS enforced via SET LOCAL in PrismaService
    return this.prisma.device.findUnique({
      where: { id: deviceId, merchantId },
    });
  }
}

// Health check
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'device-intel-service', timestamp: new Date().toISOString() };
  }
}
```

## Constraints
- All services MUST include OpenTelemetry instrumentation (traces + metrics)
- Use AsyncLocalStorage for tenant context -- NEVER pass merchantId as a parameter through service layers
- Never import from other service modules directly (use Kafka events or HTTP APIs)
- Every Kafka consumer must be idempotent (check processed_events before processing)
- Service ports: api-gateway=3000, event-collector=3001, device-intel=3002, velocity=3003, behavioral=3004, network=3005, rule-engine=3006, decision-engine=3007, telco=3008, dashboard-api=3010
