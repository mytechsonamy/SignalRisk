/**
 * SignalRisk Device Intel — Trust Score Service
 *
 * Calculates a weighted device trust score on a 0-100 scale.
 * 0 = highest risk, 100 = most trusted.
 *
 * task-s2-10: Device reputation scoring (trust_score formula)
 */

import { Injectable } from '@nestjs/common';
import { Device, DeviceAttributes } from './interfaces/device-attributes.interface';
import { EmulatorAnalysis } from './emulator-detector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrustScoreInput {
  /** The existing device record from the database. */
  device: Device;
  /** Current request attributes (from the inbound identify call). */
  currentAttrs: DeviceAttributes;
  /** Result from EmulatorDetector.detect(). */
  emulatorAnalysis: EmulatorAnalysis;
  /** Days elapsed since the device was first registered. */
  daysSinceFirstSeen: number;
  /** Days elapsed since the device was last active. */
  daysSinceLastSeen: number;
  /** Optional velocity signal: total transaction count for this device. */
  transactionCount?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_SCORE = 50;

// Positive adjustments
const BONUS_DEVICE_AGE_LONG = 10;   // >30 days old
const BONUS_DEVICE_AGE_SHORT = 5;   // >7 days old
const BONUS_RETURNING_DEVICE = 15;  // Not a new device (has a DB record)
const BONUS_STABLE_FINGERPRINT = 10; // canvasHash + webglHash unchanged

// Negative adjustments
const PENALTY_EMULATOR = 40;           // Emulator confirmed
const PENALTY_EMULATOR_CONFIDENCE = 20; // Multiplied by confidence value
const PENALTY_INACTIVITY_LONG = 10;    // Inactive >30 days
const PENALTY_INACTIVITY_SHORT = 5;    // Inactive >7 days
const PENALTY_PLATFORM_MISMATCH = 10;  // Platform changed between sessions

// Inactivity decay parameters
const DECAY_RATE = 0.95;             // Per-day exponential decay factor
const DECAY_START_DAYS = 7;          // Minimum days before decay kicks in
const DECAY_FLOOR = 10;              // Minimum score after decay (established devices)

@Injectable()
export class TrustScoreService {
  /**
   * Calculate a trust score for a known (returning) device.
   *
   * Formula:
   *   start at BASE_SCORE (50)
   *   + positive signals (device age, consistency, stable fingerprint)
   *   - negative signals (emulator, inactivity, platform mismatch)
   *   clamped to [0, 100], rounded to 2 decimal places
   */
  calculateTrustScore(input: TrustScoreInput): number {
    const {
      device,
      currentAttrs,
      emulatorAnalysis,
      daysSinceFirstSeen,
      daysSinceLastSeen,
    } = input;

    let score = BASE_SCORE;

    // -------------------------------------------------------------------
    // Positive factors
    // -------------------------------------------------------------------

    // Device age bonus — older devices with clean history are more trusted
    if (daysSinceFirstSeen > 30) {
      score += BONUS_DEVICE_AGE_LONG;
    } else if (daysSinceFirstSeen > 7) {
      score += BONUS_DEVICE_AGE_SHORT;
    }

    // Returning device bonus — presence in the DB means it has passed at
    // least one prior registration and wasn't immediately flagged
    score += BONUS_RETURNING_DEVICE;

    // Stable fingerprint bonus — if the core hash values match what was
    // stored, the session context is consistent with history
    const storedAttrs = device.attributes;
    if (
      storedAttrs &&
      currentAttrs.canvasHash === storedAttrs.canvasHash &&
      currentAttrs.webglHash === storedAttrs.webglHash
    ) {
      score += BONUS_STABLE_FINGERPRINT;
    }

    // -------------------------------------------------------------------
    // Negative factors
    // -------------------------------------------------------------------

    // Emulator penalty
    if (emulatorAnalysis.isEmulator) {
      score -= PENALTY_EMULATOR;
    }

    // Confidence-weighted emulator penalty (applies even when isEmulator is
    // false, to penalise borderline cases)
    if (emulatorAnalysis.confidence > 0) {
      score -= PENALTY_EMULATOR_CONFIDENCE * emulatorAnalysis.confidence;
    }

    // Inactivity penalty — stale devices are riskier (account takeover window)
    if (daysSinceLastSeen > 30) {
      score -= PENALTY_INACTIVITY_LONG;
    } else if (daysSinceLastSeen > 7) {
      score -= PENALTY_INACTIVITY_SHORT;
    }

    // Platform mismatch penalty — a device that switches from web to android
    // (or vice versa) between sessions is suspicious
    if (storedAttrs && currentAttrs.platform !== storedAttrs.platform) {
      score -= PENALTY_PLATFORM_MISMATCH;
    }

    // -------------------------------------------------------------------
    // Clamp and round
    // -------------------------------------------------------------------
    return this.clamp(score);
  }

  /**
   * Calculate an initial trust score for a brand-new device (first registration).
   *
   * A new device gets BASE_SCORE adjusted only for emulator signals (it has no
   * history to reward or penalise from).
   */
  calculateInitialTrustScore(
    attrs: DeviceAttributes,
    emulatorAnalysis: EmulatorAnalysis,
  ): number {
    let score = BASE_SCORE;

    if (emulatorAnalysis.isEmulator) {
      score -= PENALTY_EMULATOR;
    }

    if (emulatorAnalysis.confidence > 0) {
      score -= PENALTY_EMULATOR_CONFIDENCE * emulatorAnalysis.confidence;
    }

    return this.clamp(score);
  }

  /**
   * Apply exponential inactivity decay to an existing trust score.
   *
   * Decay formula: score * (DECAY_RATE ^ daysSinceLastSeen)
   * Decay only applies after DECAY_START_DAYS days of inactivity.
   * Result is floored at DECAY_FLOOR for established devices.
   *
   * @param currentScore  The device's current trust score.
   * @param daysSinceLastSeen  Days since the device last made a request.
   * @returns Decayed score clamped to [DECAY_FLOOR, 100].
   */
  applyInactivityDecay(currentScore: number, daysSinceLastSeen: number): number {
    if (daysSinceLastSeen <= DECAY_START_DAYS) {
      return this.clamp(currentScore);
    }

    const decayDays = daysSinceLastSeen - DECAY_START_DAYS;
    const decayed = currentScore * Math.pow(DECAY_RATE, decayDays);

    // Established devices keep a minimum floor so they're not demolished by
    // a long holiday — they just need re-evaluation on next login
    const floored = Math.max(decayed, DECAY_FLOOR);
    return this.clamp(floored);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private clamp(score: number): number {
    const bounded = Math.max(0, Math.min(100, score));
    return Math.round(bounded * 100) / 100;
  }
}
