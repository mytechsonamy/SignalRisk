/**
 * SignalRisk Velocity Engine — Burst Detection Service
 *
 * Detects velocity bursts by comparing current dimensions against a
 * rolling 7-day baseline. A burst is flagged when any dimension exceeds
 * the configured multiplier threshold (default: 3x).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VelocityService } from '../velocity/velocity.service';
import { DecayService } from '../decay/decay.service';
import { BurstResult } from '../velocity/velocity.types';

@Injectable()
export class BurstService {
  private readonly logger = new Logger(BurstService.name);
  private readonly multiplierThreshold: number;

  constructor(
    private readonly velocityService: VelocityService,
    private readonly decayService: DecayService,
    private readonly configService: ConfigService,
  ) {
    this.multiplierThreshold = this.configService.get<number>('burst.multiplierThreshold') || 3.0;
  }

  /**
   * Detect burst conditions for a given entity.
   *
   * Compares the current 1h transaction count (with exponential decay)
   * against the 7-day rolling baseline. If any dimension exceeds the
   * multiplier threshold, a burst is flagged.
   */
  async detectBurst(merchantId: string, entityId: string): Promise<BurstResult> {
    const signals = await this.velocityService.getVelocitySignals(merchantId, entityId);
    const baseline = await this.velocityService.getBaseline(merchantId, entityId);

    // If baseline is zero or negligible, we cannot meaningfully detect bursts
    if (baseline < 0.1) {
      return { detected: false, dimensions: [], multiplier: 0 };
    }

    const triggeredDimensions: string[] = [];
    let maxMultiplier = 0;

    // Check tx_count_1h against baseline (hourly average)
    const txMultiplier = signals.tx_count_1h / baseline;
    if (txMultiplier >= this.multiplierThreshold) {
      triggeredDimensions.push('tx_count_1h');
      maxMultiplier = Math.max(maxMultiplier, txMultiplier);
    }

    // Check tx_count_24h against 24h-scaled baseline
    const baseline24h = baseline * 24;
    if (baseline24h > 0) {
      const tx24hMultiplier = signals.tx_count_24h / baseline24h;
      if (tx24hMultiplier >= this.multiplierThreshold) {
        triggeredDimensions.push('tx_count_24h');
        maxMultiplier = Math.max(maxMultiplier, tx24hMultiplier);
      }
    }

    // Check amount_sum_1h — we compare raw count ratio as proxy
    // (amount baseline would require a separate amount baseline set)
    if (signals.amount_sum_1h > 0 && signals.tx_count_1h > 0) {
      const avgAmountCurrent = signals.amount_sum_1h / signals.tx_count_1h;
      // If there's an unusually high amount concentration, flag it
      // using tx-based multiplier as the primary signal
      if (txMultiplier >= this.multiplierThreshold) {
        triggeredDimensions.push('amount_sum_1h');
        maxMultiplier = Math.max(maxMultiplier, txMultiplier);
      }
    }

    // Check unique_devices_24h
    if (signals.unique_devices_24h > 0 && baseline24h > 0) {
      const deviceMultiplier = signals.unique_devices_24h / (baseline24h * 0.5); // assume ~50% unique devices per tx
      if (deviceMultiplier >= this.multiplierThreshold) {
        triggeredDimensions.push('unique_devices_24h');
        maxMultiplier = Math.max(maxMultiplier, deviceMultiplier);
      }
    }

    // Check unique_ips_24h
    if (signals.unique_ips_24h > 0 && baseline24h > 0) {
      const ipMultiplier = signals.unique_ips_24h / (baseline24h * 0.3); // assume ~30% unique IPs per tx
      if (ipMultiplier >= this.multiplierThreshold) {
        triggeredDimensions.push('unique_ips_24h');
        maxMultiplier = Math.max(maxMultiplier, ipMultiplier);
      }
    }

    // Check unique_sessions_1h
    if (signals.unique_sessions_1h > 0 && baseline > 0) {
      const sessionMultiplier = signals.unique_sessions_1h / baseline;
      if (sessionMultiplier >= this.multiplierThreshold) {
        triggeredDimensions.push('unique_sessions_1h');
        maxMultiplier = Math.max(maxMultiplier, sessionMultiplier);
      }
    }

    const detected = triggeredDimensions.length > 0;

    if (detected) {
      this.logger.warn(
        `Burst detected for ${merchantId}:${entityId} — ` +
        `dimensions=[${triggeredDimensions.join(',')}] multiplier=${maxMultiplier.toFixed(2)}`,
      );
    }

    return {
      detected,
      dimensions: triggeredDimensions,
      multiplier: Math.round(maxMultiplier * 100) / 100,
    };
  }
}
