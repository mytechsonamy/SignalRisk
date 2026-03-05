export interface SignalRiskEvent {
  type: string;
  payload: Record<string, unknown>;
  sessionId: string;
  deviceId?: string;
  merchantId: string;
  timestamp: number;
}

export interface BatcherOptions {
  endpoint: string;
  apiKey: string;
  maxBatchSize: number;    // default 10
  flushIntervalMs: number; // default 5000
  maxRetries: number;      // default 3
}

export class EventBatcher {
  private buffer: SignalRiskEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private options: BatcherOptions) {}

  push(event: Omit<SignalRiskEvent, 'timestamp'>): void {
    this.buffer.push({ ...event, timestamp: Date.now() });

    if (this.buffer.length >= this.options.maxBatchSize) {
      // Fire and forget auto-flush when batch size is reached
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      await this.sendBatch(batch);
    } catch (err) {
      // On final failure, put events back at the front of the buffer
      this.buffer.unshift(...batch);
      throw err;
    }
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.options.flushIntervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sendBatch(events: SignalRiskEvent[]): Promise<void> {
    await this.withRetry(async () => {
      const response = await fetch(`${this.options.endpoint}/v1/events/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({ events }),
      });

      if (response.status >= 400 && response.status < 500) {
        // 4xx — client error, do not retry
        const error = new Error(`Client error: ${response.status}`);
        (error as Error & { status: number }).status = response.status;
        (error as Error & { noRetry: boolean }).noRetry = true;
        throw error;
      }

      if (!response.ok) {
        // 5xx — server error, retry
        throw new Error(`Server error: ${response.status}`);
      }
    }, this.options.maxRetries);
  }

  private async withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err) {
        const error = err as Error & { noRetry?: boolean };
        if (error.noRetry || attempt >= retries - 1) {
          throw err;
        }
        // Exponential backoff: 100ms, 200ms, 400ms, ...
        const delay = 100 * Math.pow(2, attempt);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        attempt++;
      }
    }
  }
}
