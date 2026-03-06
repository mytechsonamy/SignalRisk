# Mobile SDK Reference

`@signalrisk/mobile-sdk` is a TypeScript React Native SDK providing device fingerprinting and event collection for iOS and Android applications.

## Installation

```bash
npm install @signalrisk/mobile-sdk
# Peer dependencies:
npm install react-native @react-native-async-storage/async-storage
```

For iOS, run pod install after adding the peer dependency:

```bash
cd ios && pod install
```

## SignalRiskClient

The main class for React Native integration. Manages device identification, fingerprinting, and batched event delivery.

### Constructor

```typescript
import { SignalRiskClient } from '@signalrisk/mobile-sdk';

const client = new SignalRiskClient({
  baseUrl: 'https://api.signalrisk.io',
  apiKey: 'sk_test_your_key_here',
});
```

### SignalRiskClientConfig

| Option | Type | Description |
|--------|------|-------------|
| `baseUrl` | string | API base URL |
| `apiKey` | string | Your `sk_test_...` API key |

### Methods

#### `client.init(): Promise<void>`

Loads or generates a persistent `deviceId` from AsyncStorage, collects the device fingerprint, and starts the event batcher.

```typescript
await client.init();
```

Must be called before `track()`. Typically called in your root component's `useEffect` or app initializer.

#### `client.track(eventType: string, payload?: Record<string, unknown>): void`

Enqueues an event for batched delivery. Throws if `init()` has not been called.

```typescript
client.track('page_view', { screen: 'HomeScreen' });
client.track('purchase', { amount: 49.99, currency: 'USD' });
client.track('LOGIN', { method: 'biometric' });
```

#### `client.flush(): Promise<void>`

Forces immediate delivery of all buffered events.

```typescript
await client.flush();
```

#### `client.getFingerprint(): MobileFingerprintData | null`

Returns the fingerprint data collected during `init()`, or `null` if `init()` has not been called.

```typescript
const fp = client.getFingerprint();
console.log(fp?.fingerprint, fp?.platform, fp?.deviceId);
```

#### `client.destroy(): void`

Stops the batcher timer. Call when your app component unmounts.

```typescript
useEffect(() => {
  client.init();
  return () => client.destroy();
}, []);
```

---

## MobileFingerprintData

Returned by `client.getFingerprint()` and `MobileFingerprint.collect()`.

| Field | Type | Description |
|-------|------|-------------|
| `fingerprint` | string | 8-character hex hash (djb2) of all attributes concatenated |
| `platform` | `'ios'` or `'android'` | `Platform.OS` value from React Native |
| `screenSize` | string | `"{width}x{height}"` from `Dimensions.get('window')` |
| `locale` | string | `Intl.DateTimeFormat().resolvedOptions().locale` |
| `timezone` | string | `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| `deviceId` | string | Persistent UUID loaded from AsyncStorage |

The fingerprint hash is computed using djb2 over `platform|screenSize|timezone|locale|deviceId` joined with `|`.

---

## MobileEventBatcher

Handles buffering and HTTP delivery of events. Used internally by `SignalRiskClient`.

### Behaviour

- Buffers events in memory up to `maxBatchSize` (default: 10)
- Auto-flushes every `flushIntervalMs` milliseconds (default: 5000)
- POST-s to `{baseUrl}/v1/events` with `Authorization: ApiKey {key}`
- On HTTP 429, retries up to 3 times with exponential backoff: 1s, 2s, 4s
- On HTTP 400, logs and does not retry (validation error)
- On network error, retries using the same backoff schedule

### BatcherConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | string | **required** | API base URL |
| `apiKey` | string | **required** | API key sent as `ApiKey {key}` |
| `maxBatchSize` | number | `10` | Events per flush |
| `flushIntervalMs` | number | `5000` | Auto-flush interval in ms |

### Request format

```json
{
  "events": [
    {
      "type": "purchase",
      "payload": { "amount": 49.99 },
      "sessionId": "abc123",
      "deviceId": "dev_xyz789",
      "timestamp": "2026-03-06T12:00:00.000Z"
    }
  ]
}
```

---

## Device ID Persistence

The device ID is stored under the AsyncStorage key `signalrisk_device_id`. It persists across app restarts and survives app updates.

| Scenario | Behaviour |
|----------|-----------|
| First launch | New UUID generated and stored |
| Subsequent launches | Existing UUID loaded from AsyncStorage |
| AsyncStorage cleared | New UUID generated on next `init()` |

---

## iOS vs Android Differences

| Feature | iOS | Android |
|---------|-----|---------|
| `Platform.OS` value | `'ios'` | `'android'` |
| Screen dimensions source | `UIScreen` (via `Dimensions`) | `DisplayMetrics` (via `Dimensions`) |
| DeviceId source | AsyncStorage (UUID) | AsyncStorage (UUID) |
| Locale resolution | `Intl.DateTimeFormat` | `Intl.DateTimeFormat` |

Both platforms use the same AsyncStorage-based device ID strategy — there is no platform-specific native ID used by this SDK.

---

## React Native Usage Example

```typescript
import React, { useEffect, useRef } from 'react';
import { SignalRiskClient } from '@signalrisk/mobile-sdk';

const client = new SignalRiskClient({
  baseUrl: 'https://api.signalrisk.io',
  apiKey: 'sk_test_your_key_here',
});

export function App() {
  useEffect(() => {
    client.init().then(() => {
      client.track('app_open', { version: '1.0.0' });
    });
    return () => client.destroy();
  }, []);

  const onCheckout = (amount: number) => {
    client.track('checkout', { amount, currency: 'USD' });
  };

  // ...
}
```

---

## TypeScript Exports

```typescript
import {
  SignalRiskClient,
  SignalRiskClientConfig,
  MobileFingerprint,
  MobileFingerprintData,
  MobileEventBatcher,
  MobileEvent,
  BatcherConfig,
} from '@signalrisk/mobile-sdk';
```
