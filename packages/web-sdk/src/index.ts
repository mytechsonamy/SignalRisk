import { FingerprintCollector } from './fingerprint/collector';
import { BehavioralTracker } from './behavioral/tracker';
import { EventBatcher } from './events/batcher';
import { SessionManager } from './session/session';

export type { FingerprintAttributes } from './fingerprint/collector';
export type { BehavioralMetrics } from './behavioral/tracker';
export type { SignalRiskEvent, BatcherOptions } from './events/batcher';
export { FingerprintCollector } from './fingerprint/collector';
export { BehavioralTracker } from './behavioral/tracker';
export { EventBatcher } from './events/batcher';
export { SessionManager } from './session/session';

export interface SignalRiskConfig {
  apiKey: string;
  endpoint: string;    // base URL e.g. 'https://api.signalrisk.io'
  merchantId: string;
  autoIdentify?: boolean; // default true — call identify on init
  debug?: boolean;
}

export class SignalRisk {
  private readonly config: Required<SignalRiskConfig>;
  private readonly collector: FingerprintCollector;
  private readonly tracker: BehavioralTracker;
  private readonly batcher: EventBatcher;
  private readonly session: SessionManager;
  private deviceId: string | null = null;

  constructor(config: SignalRiskConfig) {
    this.config = {
      autoIdentify: true,
      debug: false,
      ...config,
    };

    this.collector = new FingerprintCollector();
    this.tracker = new BehavioralTracker();
    this.session = new SessionManager();
    this.batcher = new EventBatcher({
      endpoint: this.config.endpoint,
      apiKey: this.config.apiKey,
      maxBatchSize: 10,
      flushIntervalMs: 5000,
      maxRetries: 3,
    });

    // Load persisted deviceId
    this.deviceId = this.session.getDeviceId();
  }

  async init(): Promise<void> {
    // 1. Start behavioral tracker
    this.tracker.start();

    // 2. Collect fingerprint (done lazily in identify)

    // 3. If autoIdentify: POST to /v1/fingerprint/identify → get deviceId
    if (this.config.autoIdentify) {
      const id = await this.identify();
      if (id) {
        this.deviceId = id;
        this.session.setDeviceId(id);
      }
    }

    // 4. Start event batcher
    this.batcher.start();

    this.log('SignalRisk SDK initialized');
  }

  track(eventType: string, payload: Record<string, unknown> = {}): void {
    this.batcher.push({
      type: eventType,
      payload,
      sessionId: this.session.getOrCreateSessionId(),
      deviceId: this.deviceId ?? undefined,
      merchantId: this.config.merchantId,
    });
  }

  async identify(): Promise<string | null> {
    try {
      const attributes = this.collector.collect();
      const response = await fetch(`${this.config.endpoint}/v1/fingerprint/identify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          merchantId: this.config.merchantId,
          ...attributes,
        }),
      });

      if (!response.ok) {
        this.log(`identify failed with status ${response.status}`);
        return null;
      }

      const data = (await response.json()) as { deviceId?: string };
      return data.deviceId ?? null;
    } catch (err) {
      this.log('identify error:', err);
      return null;
    }
  }

  async flush(): Promise<void> {
    await this.batcher.flush();
  }

  destroy(): void {
    this.tracker.stop();
    this.batcher.stop();
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[SignalRisk]', ...args);
    }
  }
}
