/**
 * SignalRisk Device Intel — Emulator Detector
 *
 * Rule-based emulator detection engine for MVP. Evaluates multiple signals
 * from DeviceAttributes to produce a confidence score and list of triggered
 * indicators.
 *
 * task-s2-11: Enhanced emulator detection
 */

import { DeviceAttributes } from './interfaces/device-attributes.interface';

export interface EmulatorAnalysis {
  /** Whether the device is classified as an emulator. */
  isEmulator: boolean;
  /** Confidence level from 0.0 (definitely real) to 1.0 (definitely emulator). */
  confidence: number;
  /** Human-readable list of rules that fired. */
  indicators: string[];
}

// ---------------------------------------------------------------------------
// Weight constants — higher weight = stronger signal of emulation
// ---------------------------------------------------------------------------

const WEIGHT_CRITICAL = 0.4;
const WEIGHT_HIGH = 0.25;
const WEIGHT_MEDIUM = 0.15;
const WEIGHT_LOW = 0.1;

// GPU renderer strings strongly associated with software/emulated rendering
const EMULATOR_GPU_PATTERNS = [
  'swiftshader',
  'llvmpipe',
  'softpipe',
  'chromium',
  'google inc',
  'android emulator',
  'genymotion',
  'bluestacks',
  'virtualbox',
  'vmware',
  'mesa offscreen',
  'microsoft basic render',
  'angle (android emulator',
];

// Android emulator default screen resolutions (width x height)
const EMULATOR_RESOLUTIONS = new Set([
  '800x600',
  '768x1280',
  '480x800',
  '480x854',
  '1080x1920', // common AVD default — low weight, not conclusive alone
  '720x1280',
  '540x960',
]);

// Highly suspicious resolutions with high weight (rarely seen on real devices)
const HIGH_RISK_RESOLUTIONS = new Set(['800x600', '768x1280']);

// androidId values that are known emulator defaults
const EMULATOR_ANDROID_IDS = new Set([
  '0000000000000000',
  '000000000000000',
  'emulator64_x86',
  'emulator_x86',
  'generic_x86',
]);

const EMULATOR_ANDROID_ID_PATTERNS = [
  /^0+$/,              // All zeros of any length
  /^[Ee]mulator/i,    // Starts with "emulator"
  /^[Gg]eneric/i,     // Starts with "generic"
];

// Audio/canvas hash values associated with emulated environments
const SUSPICIOUS_HASH_VALUES = new Set([
  '00000000',
  '0000000000000000',
  '0'.repeat(32),
  '0'.repeat(64),
]);

export class EmulatorDetector {
  /**
   * Analyse device attributes and return an EmulatorAnalysis result.
   *
   * Confidence is clamped to [0.0, 1.0].
   * isEmulator is true when confidence >= 0.5 OR a critical-weight rule fired.
   */
  detect(attrs: DeviceAttributes): EmulatorAnalysis {
    const indicators: string[] = [];
    let confidence = 0;
    let hasCritical = false;

    const addIndicator = (label: string, weight: number, critical = false) => {
      indicators.push(label);
      confidence += weight;
      if (critical) hasCritical = true;
    };

    // -----------------------------------------------------------------------
    // Rule 1 — GPU renderer patterns (critical)
    // -----------------------------------------------------------------------
    const gpuLower = (attrs.gpuRenderer ?? '').toLowerCase();

    for (const pattern of EMULATOR_GPU_PATTERNS) {
      if (gpuLower.includes(pattern)) {
        addIndicator(`gpu_renderer:${pattern}`, WEIGHT_CRITICAL, true);
        break; // one match is enough; avoid double-counting
      }
    }

    // -----------------------------------------------------------------------
    // Rule 2 — Screen resolution heuristics (android only)
    // -----------------------------------------------------------------------
    if (attrs.platform === 'android' && attrs.screenResolution) {
      const res = attrs.screenResolution.toLowerCase().replace(' ', '');
      if (HIGH_RISK_RESOLUTIONS.has(res)) {
        addIndicator(`screen_resolution_high_risk:${attrs.screenResolution}`, WEIGHT_HIGH);
      } else if (EMULATOR_RESOLUTIONS.has(res)) {
        addIndicator(`screen_resolution_suspicious:${attrs.screenResolution}`, WEIGHT_LOW);
      }
    }

    // -----------------------------------------------------------------------
    // Rule 3 — Sensor noise analysis
    // -----------------------------------------------------------------------
    if (attrs.sensorNoise && attrs.sensorNoise.length > 0) {
      const noise = attrs.sensorNoise;

      // All zeros — hardware sensors always produce some variation
      if (noise.every((n) => n === 0)) {
        addIndicator('sensor_noise:all_zeros', WEIGHT_HIGH);
      }
      // Perfectly uniform (same value repeated, but non-zero)
      else if (noise.length > 2 && noise.every((n) => n === noise[0])) {
        addIndicator('sensor_noise:uniform_values', WEIGHT_MEDIUM);
      }
      // Suspiciously low variance — real sensors have thermal noise
      else if (noise.length >= 3) {
        const mean = noise.reduce((sum, v) => sum + v, 0) / noise.length;
        const variance =
          noise.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / noise.length;
        // Variance below 1e-12 on non-zero values is suspicious
        if (mean !== 0 && variance < 1e-12) {
          addIndicator('sensor_noise:near_zero_variance', WEIGHT_MEDIUM);
        }
      }
    }

    // -----------------------------------------------------------------------
    // Rule 4 — Play Integrity Token absent for Android (high)
    // -----------------------------------------------------------------------
    if (attrs.platform === 'android' && !attrs.playIntegrityToken) {
      addIndicator('play_integrity:token_absent', WEIGHT_HIGH);
    }

    // -----------------------------------------------------------------------
    // Rule 5 — Android ID patterns (medium to high)
    // -----------------------------------------------------------------------
    if (attrs.androidId) {
      const aid = attrs.androidId.trim();

      if (EMULATOR_ANDROID_IDS.has(aid)) {
        addIndicator(`android_id:known_emulator_value:${aid}`, WEIGHT_HIGH);
      } else if (EMULATOR_ANDROID_ID_PATTERNS.some((re) => re.test(aid))) {
        addIndicator('android_id:suspicious_pattern', WEIGHT_MEDIUM);
      }
    } else if (attrs.platform === 'android') {
      // Real Android devices always have an androidId
      addIndicator('android_id:absent_on_android', WEIGHT_MEDIUM);
    }

    // -----------------------------------------------------------------------
    // Rule 6 — Common emulator screen resolutions (web platform)
    // -----------------------------------------------------------------------
    if (attrs.platform === 'web' && attrs.screenResolution) {
      // 800x600 is a classic VM/emulator default for web environments
      if (attrs.screenResolution === '800x600') {
        addIndicator('screen_resolution_web:800x600', WEIGHT_MEDIUM);
      }
    }

    // -----------------------------------------------------------------------
    // Rule 7 — Audio / Canvas hash suspicious values (low)
    // -----------------------------------------------------------------------
    if (attrs.audioHash && SUSPICIOUS_HASH_VALUES.has(attrs.audioHash)) {
      addIndicator('audio_hash:suspicious_value', WEIGHT_LOW);
    }

    if (attrs.canvasHash && SUSPICIOUS_HASH_VALUES.has(attrs.canvasHash)) {
      addIndicator('canvas_hash:suspicious_value', WEIGHT_LOW);
    }

    // WebGL hash zero (different from audio/canvas — WebGL not available on
    // most emulators without explicit GPU pass-through)
    if (attrs.webglHash && SUSPICIOUS_HASH_VALUES.has(attrs.webglHash)) {
      addIndicator('webgl_hash:suspicious_value', WEIGHT_MEDIUM);
    }

    // -----------------------------------------------------------------------
    // Finalise
    // -----------------------------------------------------------------------
    const clampedConfidence = Math.min(confidence, 1.0);
    const isEmulator = hasCritical || clampedConfidence >= 0.5;

    return {
      isEmulator,
      confidence: Math.round(clampedConfidence * 1000) / 1000, // 3 decimal places
      indicators,
    };
  }
}
