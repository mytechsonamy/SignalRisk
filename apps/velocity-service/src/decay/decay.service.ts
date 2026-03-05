/**
 * SignalRisk Velocity Engine — Exponential Decay Service
 *
 * Applies exponential decay to velocity counters at query time (not write time)
 * for efficiency. This smooths out bursty signals and gives more weight to
 * recent events.
 *
 * Formula: decayed = count * 2^(-elapsed / halfLife)
 *
 * where:
 *   - count is the raw counter value
 *   - elapsed is seconds since the counter was last updated
 *   - halfLife is the configurable half-life in seconds
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DecayService {
  /** Half-life for hourly dimensions (default: 1h = 3600s). */
  readonly halfLifeHourly: number;
  /** Half-life for daily dimensions (default: 12h = 43200s). */
  readonly halfLifeDaily: number;

  constructor(private readonly configService: ConfigService) {
    this.halfLifeHourly = this.configService.get<number>('decay.halfLifeHourly') || 3600;
    this.halfLifeDaily = this.configService.get<number>('decay.halfLifeDaily') || 43200;
  }

  /**
   * Apply exponential decay to a count value.
   *
   * @param count     - The raw counter value.
   * @param lastUpdated - Epoch seconds of the last update.
   * @param halfLife  - Half-life in seconds.
   * @returns The decayed counter value.
   */
  applyDecay(count: number, lastUpdated: number, halfLife: number): number {
    if (count <= 0 || halfLife <= 0) {
      return 0;
    }

    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - lastUpdated;

    // If the update is in the future or just happened, no decay
    if (elapsed <= 0) {
      return count;
    }

    // Exponential decay: count * 2^(-elapsed / halfLife)
    const decayFactor = Math.pow(2, -elapsed / halfLife);
    return count * decayFactor;
  }

  /**
   * Apply decay for an hourly dimension.
   */
  applyHourlyDecay(count: number, lastUpdated: number): number {
    return this.applyDecay(count, lastUpdated, this.halfLifeHourly);
  }

  /**
   * Apply decay for a daily dimension.
   */
  applyDailyDecay(count: number, lastUpdated: number): number {
    return this.applyDecay(count, lastUpdated, this.halfLifeDaily);
  }
}
