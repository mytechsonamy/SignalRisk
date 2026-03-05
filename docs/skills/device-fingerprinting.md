# Skill: device-fingerprinting

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | BACKEND_NODE |
| **Category** | backend |

## Description
Device intelligence module for SignalRisk: fingerprint generation, fuzzy matching, reputation scoring, and emulator detection. Handles both web (browser) and mobile (Android) device signals.

## Patterns
- Fingerprint generation: hash of stable device attributes (screen, GPU, fonts, etc.)
- Fuzzy matching: similarity threshold (>95% stability for same device over 24h)
- Trust score formula: weighted combination of device age, fingerprint stability, emulator flags
- Emulator detection: rule-based (adb properties, sensor noise patterns, gpu_renderer strings)
- Device reputation stored in PostgreSQL, cached in Redis
- Feature cache: `{merchantId}:feat:device:{deviceId}` in Redis

## Architecture Reference
architecture-v3.md#2.1 (device-intel-service, port 3002)

## Code Examples
```typescript
// Fingerprint generation
interface DeviceAttributes {
  screenResolution: string;
  gpuRenderer: string;
  timezone: string;
  language: string;
  fonts: string[];
  webglHash: string;
  canvasHash: string;
  audioHash: string;
  // Android-specific
  androidId?: string;
  playIntegrityToken?: string;
  sensorNoise?: number[];
}

@Injectable()
export class FingerprintService {
  generateFingerprint(attrs: DeviceAttributes): string {
    const stable = [attrs.screenResolution, attrs.gpuRenderer, attrs.timezone, attrs.webglHash];
    return createHash('sha256').update(stable.join('|')).digest('hex');
  }

  async fuzzyMatch(fingerprint: string, merchantId: string): Promise<Device | null> {
    // Check exact match first (Redis cache)
    const cached = await this.redis.get(`${merchantId}:dev:fp:${fingerprint}`);
    if (cached) return JSON.parse(cached);

    // Fuzzy match: find devices with similar attributes
    const candidates = await this.prisma.device.findMany({
      where: { merchantId, fingerprintPrefix: fingerprint.substring(0, 8) },
    });
    return candidates.find(d => this.similarity(d.fingerprint, fingerprint) > 0.95);
  }
}

// Emulator detection
@Injectable()
export class EmulatorDetector {
  detect(attrs: DeviceAttributes): { isEmulator: boolean; confidence: number; indicators: string[] } {
    const indicators: string[] = [];
    if (attrs.gpuRenderer?.includes('SwiftShader')) indicators.push('swiftshader_gpu');
    if (attrs.sensorNoise?.every(n => n === 0)) indicators.push('zero_sensor_noise');
    // ... more checks
    return {
      isEmulator: indicators.length >= 2,
      confidence: Math.min(indicators.length * 0.3, 1.0),
      indicators,
    };
  }
}
```

## Constraints
- Fingerprint stability target: >95% same-device match over 24h window
- Device lookup latency: < 50ms p99
- Trust score range: 0-100 (0 = highest risk, 100 = trusted)
- Cache device features in Redis with 24h TTL
- Emulator detection is rule-based (not ML) for MVP -- ML deferred to Phase 2
- Play Integrity (Android) responses must be verified server-side
