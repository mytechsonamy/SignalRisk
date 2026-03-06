# Skill: web-sdk-development

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | FRONTEND_REACT |
| **Category** | sdk |

## Description
JavaScript/TypeScript SDK for merchants to integrate SignalRisk into their web applications. Collects device fingerprints, behavioral signals, and browser metadata. Sends events to the event collector with batching and anti-evasion protections.

## Patterns
- Modular collectors: DeviceCollector, BehavioralCollector, BrowserCollector
- Event batching: buffer events, flush every N seconds or on threshold
- Transport: HTTPS with certificate pinning
- Payload signing: HMAC signature to prevent tampering
- Consent manager integration: respect user consent preferences
- Tree-shakeable: merchants import only needed collectors
- Target size: < 100KB gzipped

## Architecture Reference
architecture-v3.md (SDK references)

## Code Examples
```typescript
// SDK initialization
import { SignalRisk } from '@signalrisk/web-sdk';

const sr = new SignalRisk({
  apiKey: 'sk_test_...',
  endpoint: 'https://collect.signalrisk.com',
  collectors: ['device', 'behavioral', 'browser'],
});

// Start session tracking
sr.startSession({ userId: 'user-123' });

// Evaluate transaction
const decision = await sr.evaluate({
  type: 'payment',
  amount: 49.99,
  currency: 'TRY',
  msisdn: '+905...',
});
// decision = { action: 'ALLOW', riskScore: 15, requestId: '...' }

// Internal: DeviceCollector
class DeviceCollector {
  collect(): DeviceAttributes {
    return {
      screenResolution: `${screen.width}x${screen.height}`,
      gpuRenderer: this.getWebGLRenderer(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      webglHash: this.hashWebGL(),
      canvasHash: this.hashCanvas(),
      audioHash: this.hashAudioContext(),
    };
  }
}

// Internal: Event batcher
class EventBatcher {
  private buffer: Event[] = [];
  private flushInterval = 5000; // 5 seconds

  add(event: Event): void {
    this.buffer.push(event);
    if (this.buffer.length >= 10) this.flush();
  }

  private async flush(): Promise<void> {
    const events = this.buffer.splice(0);
    const payload = JSON.stringify(events);
    const signature = await this.sign(payload);
    await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Timestamp': Date.now().toString(),
      },
      body: payload,
    });
  }
}
```

## Constraints
- SDK bundle size MUST be < 100KB gzipped (tree-shakeable)
- All payloads MUST be signed (HMAC) to prevent tampering
- Consent manager: do NOT collect data if user has not consented
- Behavioral collection: timing, mouse/touch events, navigation -- NO keystroke logging
- Certificate pinning on transport layer
- Graceful failure: if collection fails, do not break the merchant's page
- Support: Chrome 80+, Firefox 78+, Safari 14+, Edge 80+
