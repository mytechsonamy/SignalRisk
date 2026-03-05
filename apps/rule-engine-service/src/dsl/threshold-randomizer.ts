import { createHash } from 'crypto';

export class ThresholdRandomizer {
  /**
   * Deterministically jitter a threshold value by ±10% using a seeded hash.
   *
   * seed = sha256(merchantId + ruleId).slice(0, 8) interpreted as uint32
   * jitter = ((seed / 0xFFFFFFFF) - 0.5) * 0.2   → range [-0.1, +0.1]
   * result = threshold * (1 + jitter)
   */
  jitter(threshold: number, merchantId: string, ruleId: string): number {
    const hash = createHash('sha256')
      .update(merchantId + ruleId)
      .digest();

    // Read first 4 bytes as big-endian uint32
    const seed =
      ((hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3]) >>> 0;

    const jitter = (seed / 0xffffffff - 0.5) * 0.2;
    return threshold * (1 + jitter);
  }
}
