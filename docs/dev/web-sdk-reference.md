# Web SDK Reference

`@signalrisk/web-sdk` is a TypeScript browser SDK that collects device fingerprints, behavioral signals, and batches events to the SignalRisk event-collector service.

## Installation

```bash
npm install @signalrisk/web-sdk
```

## SignalRisk Class

The main entry point. Orchestrates fingerprint collection, behavioral tracking, and event batching.

### Constructor

```typescript
import { SignalRisk, SignalRiskConfig } from '@signalrisk/web-sdk';

const sdk = new SignalRisk(config: SignalRiskConfig);
```

### SignalRiskConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | string | **required** | Your `sk_test_...` API key |
| `endpoint` | string | **required** | API base URL, e.g. `https://api.signalrisk.io` |
| `merchantId` | string | **required** | Your merchant identifier |
| `autoIdentify` | boolean | `true` | Call `/v1/fingerprint/identify` on `init()` to resolve a stable `deviceId` |
| `debug` | boolean | `false` | Enable `[SignalRisk]` prefixed console logging |

### Methods

#### `sdk.init(): Promise<void>`

Starts the behavioral tracker, optionally resolves `deviceId` via the identify endpoint, and starts the event batcher.

```javascript
await sdk.init();
```

#### `sdk.track(eventType: string, payload?: Record<string, unknown>): void`

Enqueues an event for batched delivery.

```javascript
sdk.track('page_view', { page: '/checkout' });
sdk.track('checkout', { cartValue: 49.99, currency: 'USD' });
sdk.track('LOGIN', { method: 'oauth' });
```

**Supported event type strings:**

| Value | Description |
|-------|-------------|
| `PAGE_VIEW` | Page navigation |
| `CLICK` | User click interaction |
| `FORM_SUBMIT` | Form submission |
| `CHECKOUT` | Checkout attempt |
| `LOGIN` | User login |
| `LOGOUT` | User logout |
| `CUSTOM` | Application-defined event |

The SDK accepts any string for `eventType`; the values above are the canonical types recognized by the decision engine.

#### `sdk.identify(): Promise<string | null>`

Manually triggers a fingerprint collection and POST to `/v1/fingerprint/identify`. Returns the resolved `deviceId` or `null` on failure.

Called automatically on `init()` when `autoIdentify` is `true`.

#### `sdk.flush(): Promise<void>`

Forces immediate delivery of all buffered events, bypassing the automatic flush interval.

```javascript
// Call before page unload to avoid losing buffered events
window.addEventListener('beforeunload', () => sdk.flush());
```

#### `sdk.destroy(): void`

Stops the behavioral tracker (removes DOM event listeners) and stops the event batcher timer. Call when your application unmounts.

---

## FingerprintCollector

Collects stable browser attributes used to build a device fingerprint. Available as a standalone export.

```typescript
import { FingerprintCollector } from '@signalrisk/web-sdk';

const collector = new FingerprintCollector();
const attributes = collector.collect();
```

### FingerprintAttributes

| Attribute | Source | Stability |
|-----------|--------|-----------|
| `screenResolution` | `window.screen.width` × `window.screen.height` | High |
| `gpuRenderer` | WebGL `UNMASKED_RENDERER_WEBGL` extension | High |
| `timezone` | `Intl.DateTimeFormat().resolvedOptions().timeZone` | High |
| `language` | `navigator.language` | High |
| `webglHash` | djb2 hash of vendor + renderer + sorted extensions | High |
| `canvasHash` | djb2 hash of `canvas.toDataURL()` with test render | Medium |
| `platform` | Always `'web'` | High |

Hashing is performed using the djb2 algorithm (no external dependencies, synchronous).

---

## BehavioralTracker

Passively monitors user interaction patterns to detect bot-like behaviour. Available as a standalone export.

```typescript
import { BehavioralTracker } from '@signalrisk/web-sdk';

const tracker = new BehavioralTracker();
tracker.start();
const metrics = tracker.getMetrics();
tracker.stop();
```

### BehavioralMetrics

| Field | Type | Description |
|-------|------|-------------|
| `timingCv` | number | Coefficient of variation of inter-click intervals. Values < 0.1 indicate machine-like regularity (bot indicator). |
| `navigationEntropy` | number | Shannon entropy of navigation paths in bits. Low entropy indicates scripted navigation. |
| `mouseJitter` | boolean | `true` if fractional mouse coordinates were detected — indicates natural human movement. |
| `clickCount` | number | Total clicks recorded since `start()`. |
| `scrollVelocity` | number | Pixels per millisecond of scroll movement. |
| `formFillSpeed` | number | Reserved for future form field timing (currently `0`). |

The tracker listens to `mousemove`, `click`, and `scroll` events. A sliding window of the last 10 click timestamps is used for `timingCv`. The last 50 mouse positions are kept for jitter analysis. All listeners are removed on `stop()`.

---

## EventBatcher

Handles batching and delivery of events to `/v1/events`. Used internally by `SignalRisk` but available as a standalone export.

```typescript
import { EventBatcher } from '@signalrisk/web-sdk';

const batcher = new EventBatcher({
  endpoint: 'https://api.signalrisk.io',
  apiKey: 'sk_test_...',
  maxBatchSize: 10,
  flushIntervalMs: 5000,
  maxRetries: 3,
});
batcher.start();
batcher.push({ type: 'page_view', payload: {}, sessionId: '...', deviceId: '...', merchantId: '...' });
await batcher.flush();
batcher.stop();
```

### BatcherOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endpoint` | string | **required** | Base URL for the API |
| `apiKey` | string | **required** | API key sent as `Bearer` token |
| `maxBatchSize` | number | `10` | Maximum events per HTTP POST |
| `flushIntervalMs` | number | `5000` | Milliseconds between automatic flushes |
| `maxRetries` | number | `3` | Retry attempts on 429 or network failure |

### Error handling

- **429 Too Many Requests** — automatic exponential backoff before retry (1s, 2s, 4s)
- **400 Bad Request** — logged, not retried (validation error)
- **Network errors** — events remain buffered and are retried on the next flush cycle

---

## SessionManager

Manages session and device ID persistence in `localStorage`.

```typescript
import { SessionManager } from '@signalrisk/web-sdk';

const session = new SessionManager();
const sessionId = session.getOrCreateSessionId(); // UUID v4
const deviceId = session.getDeviceId();           // null until identify() resolves
session.setDeviceId('dev_abc123');
```

The session ID is regenerated on each page load. The device ID persists across sessions.

---

## TypeScript Exports

```typescript
import {
  SignalRisk,
  SignalRiskConfig,
  FingerprintCollector,
  FingerprintAttributes,
  BehavioralTracker,
  BehavioralMetrics,
  EventBatcher,
  SignalRiskEvent,
  BatcherOptions,
  SessionManager,
} from '@signalrisk/web-sdk';
```
