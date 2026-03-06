# Getting Started with SignalRisk

SignalRisk provides real-time fraud detection through device fingerprinting, behavioral analysis, and velocity-based risk scoring. This guide walks you through integrating the web SDK, tracking your first events, and handling webhook decision callbacks.

## Prerequisites

- Node.js 18 or later
- An npm account (for installing the SDK packages)
- A SignalRisk API key (`sk_test_...`) — obtain one from the SignalRisk dashboard

## Install the Web SDK

```bash
npm install @signalrisk/web-sdk
```

## Initialize the SDK

```javascript
import { SignalRisk } from '@signalrisk/web-sdk';

const sdk = new SignalRisk({
  apiKey: 'sk_test_your_key_here',
  endpoint: 'https://api.signalrisk.io',
  merchantId: 'your_merchant_id',
});

await sdk.init();
```

The `init()` call:
1. Starts the behavioral tracker (mouse, click, scroll listeners)
2. Collects the browser fingerprint and POST-s to `/v1/fingerprint/identify` to obtain a stable `deviceId`
3. Starts the event batcher (auto-flushes every 5 seconds or when 10 events accumulate)

## Track Your First Event

```javascript
sdk.track('page_view', { page: window.location.pathname });
sdk.track('checkout', { cartValue: 99.99, currency: 'USD' });
```

Events are buffered locally and flushed as batches to `POST /v1/events`. To send immediately:

```javascript
await sdk.flush();
```

## Receiving Webhook Decisions

SignalRisk calls your configured webhook URL with a decision payload after evaluating each event. Verify the `X-SignalRisk-Signature` header before processing:

```javascript
// Node.js webhook verification
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return `sha256=${expected}` === signature;
}

app.post('/webhook', (req, res) => {
  const sig = req.headers['x-signalrisk-signature'];
  if (!verifyWebhook(req.body, sig, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  const { action, riskScore, entityId } = req.body;

  switch (action) {
    case 'ALLOW':
      // Proceed normally
      break;
    case 'REVIEW':
      // Flag for manual review
      break;
    case 'BLOCK':
      // Decline the transaction
      break;
  }

  res.sendStatus(200);
});
```

**Webhook payload fields:**

| Field | Type | Description |
|-------|------|-------------|
| `decisionId` | string | Unique decision identifier |
| `merchantId` | string | Your merchant ID |
| `entityId` | string | The user or transaction ID |
| `action` | string | `ALLOW`, `REVIEW`, or `BLOCK` |
| `riskScore` | number | 0–100, higher = riskier |
| `firedRuleIds` | string[] | Rule IDs that triggered the decision |
| `timestamp` | string | ISO 8601 timestamp |

## Cleanup

When the user leaves your application, destroy the SDK to remove event listeners and stop background timers:

```javascript
sdk.destroy();
```

## Next Steps

- [Web SDK Reference](./web-sdk-reference.md) — full API, configuration options, fingerprint attributes
- [Mobile SDK Reference](./mobile-sdk-reference.md) — React Native integration
- [API Reference](./api-reference.md) — complete REST API documentation
- [Architecture](./architecture.md) — system design and data flow
