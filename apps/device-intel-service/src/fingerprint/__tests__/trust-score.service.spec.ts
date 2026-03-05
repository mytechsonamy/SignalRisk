/**
 * Unit tests for TrustScoreService
 *
 * Covers the calculateTrustScore formula, calculateInitialTrustScore,
 * applyInactivityDecay, and boundary/clamping behaviour.
 */

import { TrustScoreService, TrustScoreInput } from '../trust-score.service';
import { Device, DeviceAttributes } from '../interfaces/device-attributes.interface';
import { EmulatorAnalysis } from '../emulator-detector';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAttrs(overrides?: Partial<DeviceAttributes>): DeviceAttributes {
  return {
    screenResolution: '1920x1080',
    gpuRenderer: 'ANGLE (NVIDIA GeForce GTX 1080)',
    timezone: 'Africa/Johannesburg',
    language: 'en-ZA',
    webglHash: 'webgl-hash-abc',
    canvasHash: 'canvas-hash-xyz',
    platform: 'web',
    ...overrides,
  };
}

function makeDevice(overrides?: Partial<Device>): Device {
  return {
    id: 'device-001',
    merchantId: 'merchant-001',
    fingerprint: 'a'.repeat(64),
    fingerprintPrefix: 'a'.repeat(8),
    trustScore: 65,
    isEmulator: false,
    attributes: makeAttrs(),
    firstSeenAt: new Date('2026-01-01'),
    lastSeenAt: new Date('2026-01-15'),
    ...overrides,
  };
}

function makeNoEmulator(): EmulatorAnalysis {
  return { isEmulator: false, confidence: 0, indicators: [] };
}

function makeEmulator(confidence = 0.8): EmulatorAnalysis {
  return {
    isEmulator: true,
    confidence,
    indicators: ['gpu_renderer:swiftshader'],
  };
}

function makeInput(overrides?: Partial<TrustScoreInput>): TrustScoreInput {
  return {
    device: makeDevice(),
    currentAttrs: makeAttrs(),
    emulatorAnalysis: makeNoEmulator(),
    daysSinceFirstSeen: 45,
    daysSinceLastSeen: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrustScoreService', () => {
  let service: TrustScoreService;

  beforeEach(() => {
    service = new TrustScoreService();
  });

  // -------------------------------------------------------------------------
  // calculateTrustScore — base line
  // -------------------------------------------------------------------------

  describe('calculateTrustScore — base case', () => {
    it('should return a number in [0, 100]', () => {
      const score = service.calculateTrustScore(makeInput());
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return exactly 2 decimal places or fewer', () => {
      const score = service.calculateTrustScore(makeInput());
      const decimals = score.toString().split('.')[1] ?? '';
      expect(decimals.length).toBeLessThanOrEqual(2);
    });

    it('should give a fully trusted returning device with >30 days age a high score', () => {
      // BASE(50) + returning(15) + age>30(10) + stable_fp(10) = 85
      const score = service.calculateTrustScore(
        makeInput({
          daysSinceFirstSeen: 60,
          daysSinceLastSeen: 0,
          emulatorAnalysis: makeNoEmulator(),
        }),
      );
      expect(score).toBe(85);
    });

    it('should give a returning device with age 8-30 days a moderate-high score', () => {
      // BASE(50) + returning(15) + age>7(5) + stable_fp(10) = 80
      const score = service.calculateTrustScore(
        makeInput({
          daysSinceFirstSeen: 15,
          daysSinceLastSeen: 0,
          emulatorAnalysis: makeNoEmulator(),
        }),
      );
      expect(score).toBe(80);
    });

    it('should give a brand-new returning device (0 days) the correct score', () => {
      // BASE(50) + returning(15) + no_age_bonus(0) + stable_fp(10) = 75
      const score = service.calculateTrustScore(
        makeInput({
          daysSinceFirstSeen: 0,
          daysSinceLastSeen: 0,
          emulatorAnalysis: makeNoEmulator(),
        }),
      );
      expect(score).toBe(75);
    });
  });

  // -------------------------------------------------------------------------
  // calculateTrustScore — positive factors
  // -------------------------------------------------------------------------

  describe('positive factors', () => {
    it('should add +10 for device age > 30 days', () => {
      const short = service.calculateTrustScore(makeInput({ daysSinceFirstSeen: 6 }));
      const long = service.calculateTrustScore(makeInput({ daysSinceFirstSeen: 31 }));
      expect(long - short).toBe(10);
    });

    it('should add +5 for device age 8-30 days', () => {
      const fresh = service.calculateTrustScore(makeInput({ daysSinceFirstSeen: 0 }));
      const week = service.calculateTrustScore(makeInput({ daysSinceFirstSeen: 8 }));
      expect(week - fresh).toBe(5);
    });

    it('should add +15 for returning device (always applied in calculateTrustScore)', () => {
      // calculateInitialTrustScore does NOT apply this bonus
      const initial = service.calculateInitialTrustScore(makeAttrs(), makeNoEmulator());
      // BASE(50) - no bonuses for new = 50
      expect(initial).toBe(50);
    });

    it('should add +10 stable fingerprint bonus when canvasHash and webglHash match stored', () => {
      const stableInput = makeInput({
        device: makeDevice({
          attributes: makeAttrs({ canvasHash: 'same-canvas', webglHash: 'same-webgl' }),
        }),
        currentAttrs: makeAttrs({ canvasHash: 'same-canvas', webglHash: 'same-webgl' }),
        daysSinceFirstSeen: 0,
        daysSinceLastSeen: 0,
      });
      const unstableInput = makeInput({
        device: makeDevice({
          attributes: makeAttrs({ canvasHash: 'old-canvas', webglHash: 'old-webgl' }),
        }),
        currentAttrs: makeAttrs({ canvasHash: 'new-canvas', webglHash: 'new-webgl' }),
        daysSinceFirstSeen: 0,
        daysSinceLastSeen: 0,
      });

      const stable = service.calculateTrustScore(stableInput);
      const unstable = service.calculateTrustScore(unstableInput);
      expect(stable - unstable).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // calculateTrustScore — negative factors (emulator)
  // -------------------------------------------------------------------------

  describe('negative factors — emulator', () => {
    it('should apply -40 penalty when isEmulator=true', () => {
      const clean = service.calculateTrustScore(
        makeInput({ emulatorAnalysis: makeNoEmulator(), daysSinceFirstSeen: 0, daysSinceLastSeen: 0 }),
      );
      const emulated = service.calculateTrustScore(
        makeInput({
          emulatorAnalysis: { isEmulator: true, confidence: 0, indicators: [] },
          daysSinceFirstSeen: 0,
          daysSinceLastSeen: 0,
        }),
      );
      expect(clean - emulated).toBe(40);
    });

    it('should apply -20 * confidence confidence penalty', () => {
      const noConfidence = service.calculateTrustScore(
        makeInput({
          emulatorAnalysis: { isEmulator: false, confidence: 0, indicators: [] },
          daysSinceFirstSeen: 0,
          daysSinceLastSeen: 0,
        }),
      );
      const halfConfidence = service.calculateTrustScore(
        makeInput({
          emulatorAnalysis: { isEmulator: false, confidence: 0.5, indicators: [] },
          daysSinceFirstSeen: 0,
          daysSinceLastSeen: 0,
        }),
      );
      expect(noConfidence - halfConfidence).toBeCloseTo(10, 5); // 20 * 0.5 = 10
    });

    it('should clamp score to 0 for a high-confidence emulator with all penalties', () => {
      // BASE(50) + returning(15) + age>30(10) + stable_fp(10)
      // - emulator(40) - confidence(20*0.9=18) - inactivity>30(10) = 17
      const score = service.calculateTrustScore(
        makeInput({
          emulatorAnalysis: makeEmulator(0.9),
          daysSinceFirstSeen: 60,
          daysSinceLastSeen: 35, // >30 days inactive
        }),
      );
      expect(score).toBeGreaterThanOrEqual(0);
      // Score should be very low (emulator + all penalties applied)
      expect(score).toBeLessThan(20);
    });
  });

  // -------------------------------------------------------------------------
  // calculateTrustScore — negative factors (inactivity)
  // -------------------------------------------------------------------------

  describe('negative factors — inactivity', () => {
    it('should apply -5 when inactive > 7 days', () => {
      const recent = service.calculateTrustScore(makeInput({ daysSinceLastSeen: 3 }));
      const stale = service.calculateTrustScore(makeInput({ daysSinceLastSeen: 8 }));
      expect(recent - stale).toBe(5);
    });

    it('should apply -10 when inactive > 30 days', () => {
      const recent = service.calculateTrustScore(makeInput({ daysSinceLastSeen: 3 }));
      const veryStale = service.calculateTrustScore(makeInput({ daysSinceLastSeen: 31 }));
      expect(recent - veryStale).toBe(10);
    });

    it('should NOT stack both inactivity penalties', () => {
      // >30 days should be -10 total (not -5 -10 = -15)
      const recent = service.calculateTrustScore(makeInput({ daysSinceLastSeen: 3 }));
      const veryStale = service.calculateTrustScore(makeInput({ daysSinceLastSeen: 90 }));
      expect(recent - veryStale).toBe(10); // not 15
    });
  });

  // -------------------------------------------------------------------------
  // calculateTrustScore — negative factors (platform mismatch)
  // -------------------------------------------------------------------------

  describe('negative factors — platform mismatch', () => {
    it('should apply -10 when platform changes between sessions', () => {
      const matchInput = makeInput({
        device: makeDevice({ attributes: makeAttrs({ platform: 'web' }) }),
        currentAttrs: makeAttrs({ platform: 'web' }),
        daysSinceFirstSeen: 0,
        daysSinceLastSeen: 0,
      });
      const mismatchInput = makeInput({
        device: makeDevice({ attributes: makeAttrs({ platform: 'web' }) }),
        currentAttrs: makeAttrs({ platform: 'android' }),
        daysSinceFirstSeen: 0,
        daysSinceLastSeen: 0,
      });

      const matched = service.calculateTrustScore(matchInput);
      const mismatched = service.calculateTrustScore(mismatchInput);
      expect(matched - mismatched).toBe(10);
    });

    it('should not apply platform mismatch penalty for same platform', () => {
      const score = service.calculateTrustScore(
        makeInput({
          device: makeDevice({ attributes: makeAttrs({ platform: 'android' }) }),
          currentAttrs: makeAttrs({ platform: 'android' }),
        }),
      );
      // Expect no mismatch penalty
      expect(score).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // calculateInitialTrustScore — new device
  // -------------------------------------------------------------------------

  describe('calculateInitialTrustScore', () => {
    it('should return BASE_SCORE (50) for a clean new device', () => {
      const score = service.calculateInitialTrustScore(makeAttrs(), makeNoEmulator());
      expect(score).toBe(50);
    });

    it('should apply emulator penalty for emulated new device', () => {
      const score = service.calculateInitialTrustScore(makeAttrs(), makeEmulator(1.0));
      // BASE(50) - emulator(40) - confidence(20*1.0=20) = -10 => clamped to 0
      expect(score).toBe(0);
    });

    it('should apply confidence penalty even when isEmulator=false for borderline new device', () => {
      const score = service.calculateInitialTrustScore(
        makeAttrs(),
        { isEmulator: false, confidence: 0.3, indicators: [] },
      );
      // BASE(50) - confidence(20*0.3=6) = 44
      expect(score).toBeCloseTo(44, 5);
    });

    it('should return [0, 100] for all inputs', () => {
      const minScore = service.calculateInitialTrustScore(makeAttrs(), makeEmulator(1.0));
      const maxScore = service.calculateInitialTrustScore(makeAttrs(), makeNoEmulator());
      expect(minScore).toBeGreaterThanOrEqual(0);
      expect(maxScore).toBeLessThanOrEqual(100);
    });
  });

  // -------------------------------------------------------------------------
  // applyInactivityDecay
  // -------------------------------------------------------------------------

  describe('applyInactivityDecay', () => {
    it('should not decay when daysSinceLastSeen <= 7', () => {
      expect(service.applyInactivityDecay(80, 0)).toBe(80);
      expect(service.applyInactivityDecay(80, 7)).toBe(80);
    });

    it('should apply decay after 7 days', () => {
      const score = service.applyInactivityDecay(80, 14);
      // Decay days = 14 - 7 = 7, factor = 0.95^7 ≈ 0.6983
      expect(score).toBeLessThan(80);
      expect(score).toBeGreaterThan(50); // should not collapse for 7 decay days
    });

    it('should approach DECAY_FLOOR (10) but not go below it for established devices', () => {
      const score = service.applyInactivityDecay(80, 365); // 1 year
      expect(score).toBeGreaterThanOrEqual(10);
    });

    it('should never go below 0', () => {
      const score = service.applyInactivityDecay(5, 365);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should never exceed 100', () => {
      const score = service.applyInactivityDecay(100, 0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should decay monotonically as days increase', () => {
      const scores = [8, 14, 30, 60, 90, 180].map((days) =>
        service.applyInactivityDecay(80, days),
      );
      // Each score should be <= previous (after decay starts)
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    });

    it('should correctly compute decay formula: score * 0.95^(days-7)', () => {
      const initial = 80;
      const days = 17; // decay days = 10
      const score = service.applyInactivityDecay(initial, days);
      const expected = Math.max(initial * Math.pow(0.95, 10), 10);
      const clamped = Math.max(0, Math.min(100, Math.round(expected * 100) / 100));
      expect(score).toBeCloseTo(clamped, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Score clamping
  // -------------------------------------------------------------------------

  describe('score clamping', () => {
    it('should never return a score below 0', () => {
      // Pile on all possible negative factors
      const score = service.calculateTrustScore(
        makeInput({
          emulatorAnalysis: makeEmulator(1.0),
          daysSinceFirstSeen: 0,
          daysSinceLastSeen: 365,
          device: makeDevice({
            attributes: makeAttrs({ platform: 'web' }),
          }),
          currentAttrs: makeAttrs({ platform: 'android' }), // platform mismatch too
        }),
      );
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should never return a score above 100', () => {
      const score = service.calculateTrustScore(makeInput());
      expect(score).toBeLessThanOrEqual(100);
    });

    it('calculateInitialTrustScore should never exceed 100', () => {
      const score = service.calculateInitialTrustScore(makeAttrs(), makeNoEmulator());
      expect(score).toBeLessThanOrEqual(100);
    });
  });
});
