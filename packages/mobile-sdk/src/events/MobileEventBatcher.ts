export interface MobileEvent {
  type: string;
  payload: Record<string, unknown>;
  sessionId: string;
  deviceId: string;
  timestamp: string;
}

export interface BatcherConfig {
  baseUrl: string;
  apiKey: string;
  maxBatchSize?: number;
  flushIntervalMs?: number;
}

export class MobileEventBatcher {
  private buffer: MobileEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly config: Required<BatcherConfig>;

  constructor(config: BatcherConfig) {
    this.config = {
      maxBatchSize: 10,
      flushIntervalMs: 5000,
      ...config,
    };
  }

  start(): void {
    this.timer = setInterval(() => this.flush(), this.config.flushIntervalMs);
  }

  add(event: MobileEvent): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.config.maxBatchSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const events = [...this.buffer];
    this.buffer = [];
    await this.sendWithRetry(events, 3);
  }

  private async sendWithRetry(events: MobileEvent[], attempts: number): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const res = await fetch(`${this.config.baseUrl}/v1/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `ApiKey ${this.config.apiKey}`,
          },
          body: JSON.stringify({ events }),
        });
        if (res.ok || res.status === 400) return; // 400 = validation error, don't retry
        if (res.status === 429 && attempt < attempts - 1) {
          await this.sleep(Math.pow(2, attempt) * 1000);
          continue;
        }
        return;
      } catch {
        if (attempt < attempts - 1) await this.sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getBufferSize(): number { return this.buffer.length; }
}
