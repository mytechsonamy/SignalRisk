import { Injectable } from '@nestjs/common';

interface Bucket {
  count: number;
  windowStart: number;
}

@Injectable()
export class IpRateLimitService {
  private readonly buckets = new Map<string, Bucket>();
  readonly LIMIT = 100;  // per minute
  readonly WINDOW_MS = 60000;

  checkIp(ip: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const bucket = this.buckets.get(ip);

    if (!bucket || now - bucket.windowStart > this.WINDOW_MS) {
      this.buckets.set(ip, { count: 1, windowStart: now });
      return { allowed: true, remaining: this.LIMIT - 1 };
    }

    if (bucket.count >= this.LIMIT) {
      return { allowed: false, remaining: 0 };
    }

    bucket.count++;
    return { allowed: true, remaining: this.LIMIT - bucket.count };
  }
}
