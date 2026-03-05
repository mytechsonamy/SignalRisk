/**
 * Unit tests for EmulatorDetector
 *
 * Covers each detection rule independently and verifies confidence
 * accumulation and isEmulator threshold logic.
 */

import { EmulatorDetector, EmulatorAnalysis } from '../emulator-detector';
import { DeviceAttributes } from '../interfaces/device-attributes.interface';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWebAttrs(overrides?: Partial<DeviceAttributes>): DeviceAttributes {
  return {
    screenResolution: '1920x1080',
    gpuRenderer: 'ANGLE (NVIDIA GeForce GTX 1080 Direct3D11 vs_5_0 ps_5_0)',
    timezone: 'Africa/Johannesburg',
    language: 'en-ZA',
    webglHash: 'abc123def456',
    canvasHash: 'canvas789xyz',
    platform: 'web',
    ...overrides,
  };
}

function makeAndroidAttrs(overrides?: Partial<DeviceAttributes>): DeviceAttributes {
  return {
    screenResolution: '1080x2400',
    gpuRenderer: 'Adreno (TM) 650',
    timezone: 'Africa/Johannesburg',
    language: 'en-ZA',
    webglHash: 'realwebgl123',
    canvasHash: 'realcanvas456',
    androidId: 'a1b2c3d4e5f60001',
    playIntegrityToken: 'real-play-integrity-token-xyz',
    sensorNoise: [0.0012, 0.0034, 0.0001, 0.0056, 0.0023],
    platform: 'android',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('EmulatorDetector', () => {
  let detector: EmulatorDetector;

  beforeEach(() => {
    detector = new EmulatorDetector();
  });

  // -------------------------------------------------------------------------
  // Real device — should not be flagged
  // -------------------------------------------------------------------------

  describe('real devices (negative cases)', () => {
    it('should not flag a real web device', () => {
      const result = detector.detect(makeWebAttrs());
      expect(result.isEmulator).toBe(false);
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.indicators).toHaveLength(0);
    });

    it('should not flag a real Android device with all signals present', () => {
      const result = detector.detect(makeAndroidAttrs());
      expect(result.isEmulator).toBe(false);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should not flag ANGLE-wrapped NVIDIA GPU', () => {
      const result = detector.detect(
        makeWebAttrs({ gpuRenderer: 'ANGLE (NVIDIA GeForce RTX 3080 Direct3D11)' }),
      );
      expect(result.isEmulator).toBe(false);
    });

    it('should not flag ANGLE-wrapped AMD GPU', () => {
      const result = detector.detect(
        makeWebAttrs({ gpuRenderer: 'ANGLE (AMD Radeon RX 6800 XT Direct3D11)' }),
      );
      expect(result.isEmulator).toBe(false);
    });

    it('should not flag real sensor noise with slight variance', () => {
      const result = detector.detect(
        makeAndroidAttrs({ sensorNoise: [0.0012, 0.0034, 0.0001] }),
      );
      expect(result.indicators).not.toContain('sensor_noise:all_zeros');
      expect(result.indicators).not.toContain('sensor_noise:uniform_values');
    });
  });

  // -------------------------------------------------------------------------
  // Rule 1 — GPU renderer patterns (critical weight)
  // -------------------------------------------------------------------------

  describe('Rule 1: GPU renderer patterns', () => {
    const criticalGpus = [
      ['SwiftShader', 'Google SwiftShader'],
      ['llvmpipe', 'llvmpipe (LLVM 12.0.0, 256 bits)'],
      ['softpipe', 'softpipe'],
      ['chromium', 'Chromium'],
      ['google inc', 'Google Inc. (SwiftShader)'],
      ['android emulator', 'Android Emulator OpenGL ES 3.0'],
      ['genymotion', 'Genymotion Virtual Device'],
      ['bluestacks', 'BlueStacks Renderer'],
      ['virtualbox', 'VirtualBox Graphics Adapter'],
      ['vmware', 'VMware SVGA 3D'],
    ];

    it.each(criticalGpus)('should detect %s as emulator (critical)', (_, gpuRenderer) => {
      const result = detector.detect(makeWebAttrs({ gpuRenderer }));
      expect(result.isEmulator).toBe(true);
      // Critical hit means even low overall confidence must set isEmulator
      expect(result.indicators.some((i) => i.startsWith('gpu_renderer:'))).toBe(true);
    });

    it('should mark isEmulator=true even if confidence < 0.5 for GPU critical hit', () => {
      // Minimal attrs — only GPU is suspicious
      const result = detector.detect(
        makeWebAttrs({
          gpuRenderer: 'SwiftShader',
          sensorNoise: undefined,
          audioHash: undefined,
        }),
      );
      expect(result.isEmulator).toBe(true);
    });

    it('should not add more than one GPU indicator for a single match', () => {
      const result = detector.detect(makeWebAttrs({ gpuRenderer: 'llvmpipe swiftshader' }));
      const gpuIndicators = result.indicators.filter((i) => i.startsWith('gpu_renderer:'));
      expect(gpuIndicators).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 2 — Screen density/resolution heuristics (android)
  // -------------------------------------------------------------------------

  describe('Rule 2: Screen resolution heuristics (Android)', () => {
    it('should flag 800x600 as high risk on Android', () => {
      const result = detector.detect(makeAndroidAttrs({ screenResolution: '800x600' }));
      expect(result.indicators.some((i) => i.includes('screen_resolution_high_risk'))).toBe(true);
    });

    it('should flag 768x1280 as high risk on Android', () => {
      const result = detector.detect(makeAndroidAttrs({ screenResolution: '768x1280' }));
      expect(result.indicators.some((i) => i.includes('screen_resolution_high_risk'))).toBe(true);
    });

    it('should flag 480x800 as suspicious (low weight) on Android', () => {
      const result = detector.detect(makeAndroidAttrs({ screenResolution: '480x800' }));
      expect(result.indicators.some((i) => i.includes('screen_resolution_suspicious'))).toBe(true);
    });

    it('should NOT flag screen resolution on web platform', () => {
      const result = detector.detect(makeWebAttrs({ screenResolution: '800x600' }));
      // Web rule is separate — only the web-specific 800x600 rule applies (medium weight)
      expect(result.indicators.some((i) => i.includes('screen_resolution_high_risk'))).toBe(false);
    });

    it('should not flag standard Android resolutions like 1080x2400', () => {
      const result = detector.detect(makeAndroidAttrs({ screenResolution: '1080x2400' }));
      expect(result.indicators.some((i) => i.includes('screen_resolution'))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 3 — Sensor noise analysis
  // -------------------------------------------------------------------------

  describe('Rule 3: Sensor noise analysis', () => {
    it('should detect all-zero sensor noise as suspicious (high weight)', () => {
      const result = detector.detect(makeAndroidAttrs({ sensorNoise: [0, 0, 0] }));
      expect(result.indicators).toContain('sensor_noise:all_zeros');
    });

    it('should detect uniform non-zero sensor noise as suspicious (medium weight)', () => {
      const result = detector.detect(makeAndroidAttrs({ sensorNoise: [1.5, 1.5, 1.5, 1.5] }));
      expect(result.indicators).toContain('sensor_noise:uniform_values');
    });

    it('should detect near-zero variance in non-zero sensors', () => {
      // Tiny differences that a real sensor would produce with actual thermal noise
      const almostIdentical = [1.0000000001, 1.0000000002, 1.0000000001];
      const result = detector.detect(makeAndroidAttrs({ sensorNoise: almostIdentical }));
      expect(result.indicators).toContain('sensor_noise:near_zero_variance');
    });

    it('should not flag genuine sensor variation', () => {
      const result = detector.detect(
        makeAndroidAttrs({ sensorNoise: [0.0012, 0.0034, 0.0001, 0.0056] }),
      );
      expect(result.indicators.some((i) => i.startsWith('sensor_noise'))).toBe(false);
    });

    it('should not flag empty sensor array', () => {
      const result = detector.detect(makeAndroidAttrs({ sensorNoise: [] }));
      expect(result.indicators.some((i) => i.startsWith('sensor_noise'))).toBe(false);
    });

    it('should not flag absent sensorNoise field', () => {
      const result = detector.detect(makeAndroidAttrs({ sensorNoise: undefined }));
      expect(result.indicators.some((i) => i.startsWith('sensor_noise'))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 4 — Play Integrity Token absent (Android)
  // -------------------------------------------------------------------------

  describe('Rule 4: Play Integrity Token', () => {
    it('should flag missing playIntegrityToken on Android (high weight)', () => {
      const result = detector.detect(
        makeAndroidAttrs({ playIntegrityToken: undefined }),
      );
      expect(result.indicators).toContain('play_integrity:token_absent');
    });

    it('should not flag missing playIntegrityToken on web platform', () => {
      const result = detector.detect(
        makeWebAttrs({ playIntegrityToken: undefined }),
      );
      expect(result.indicators).not.toContain('play_integrity:token_absent');
    });

    it('should not flag present playIntegrityToken on Android', () => {
      const result = detector.detect(
        makeAndroidAttrs({ playIntegrityToken: 'valid-integrity-token' }),
      );
      expect(result.indicators).not.toContain('play_integrity:token_absent');
    });
  });

  // -------------------------------------------------------------------------
  // Rule 5 — Android ID patterns
  // -------------------------------------------------------------------------

  describe('Rule 5: Android ID patterns', () => {
    it('should flag all-zero androidId as high risk', () => {
      const result = detector.detect(makeAndroidAttrs({ androidId: '0000000000000000' }));
      expect(result.indicators.some((i) => i.includes('android_id:known_emulator_value'))).toBe(true);
    });

    it('should flag 15-zero androidId as high risk', () => {
      const result = detector.detect(makeAndroidAttrs({ androidId: '000000000000000' }));
      expect(result.indicators.some((i) => i.includes('android_id:known_emulator_value'))).toBe(true);
    });

    it('should flag androidId matching emulator patterns', () => {
      const result = detector.detect(makeAndroidAttrs({ androidId: 'emulator64_x86' }));
      expect(result.indicators.some((i) => i.includes('android_id:known_emulator_value'))).toBe(true);
    });

    it('should flag androidId matching /^Emulator/ pattern', () => {
      const result = detector.detect(makeAndroidAttrs({ androidId: 'EmulatorDevice123' }));
      expect(result.indicators).toContain('android_id:suspicious_pattern');
    });

    it('should flag androidId matching /^generic/ pattern', () => {
      const result = detector.detect(makeAndroidAttrs({ androidId: 'generic_x86_64' }));
      expect(result.indicators).toContain('android_id:suspicious_pattern');
    });

    it('should flag absent androidId on Android as medium risk', () => {
      const result = detector.detect(makeAndroidAttrs({ androidId: undefined }));
      expect(result.indicators).toContain('android_id:absent_on_android');
    });

    it('should not flag absent androidId on web platform', () => {
      const result = detector.detect(makeWebAttrs({ androidId: undefined }));
      expect(result.indicators).not.toContain('android_id:absent_on_android');
    });

    it('should not flag a genuine androidId', () => {
      const result = detector.detect(makeAndroidAttrs({ androidId: 'a1b2c3d4e5f60001' }));
      expect(result.indicators.some((i) => i.startsWith('android_id'))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 6 — Common emulator screen resolutions (web)
  // -------------------------------------------------------------------------

  describe('Rule 6: Web platform emulator resolution', () => {
    it('should flag 800x600 on web as suspicious (medium weight)', () => {
      const result = detector.detect(makeWebAttrs({ screenResolution: '800x600' }));
      expect(result.indicators).toContain('screen_resolution_web:800x600');
    });

    it('should not flag 1920x1080 on web', () => {
      const result = detector.detect(makeWebAttrs({ screenResolution: '1920x1080' }));
      expect(result.indicators).not.toContain('screen_resolution_web:800x600');
    });
  });

  // -------------------------------------------------------------------------
  // Rule 7 — Audio / Canvas / WebGL hash suspicious values
  // -------------------------------------------------------------------------

  describe('Rule 7: Suspicious hash values', () => {
    it('should flag all-zero audioHash (low weight)', () => {
      const result = detector.detect(makeWebAttrs({ audioHash: '00000000' }));
      expect(result.indicators).toContain('audio_hash:suspicious_value');
    });

    it('should flag all-zero canvasHash (low weight)', () => {
      const result = detector.detect(makeWebAttrs({ canvasHash: '00000000' }));
      expect(result.indicators).toContain('canvas_hash:suspicious_value');
    });

    it('should flag all-zero webglHash (medium weight)', () => {
      const result = detector.detect(makeWebAttrs({ webglHash: '00000000' }));
      expect(result.indicators).toContain('webgl_hash:suspicious_value');
    });

    it('should not flag absent audioHash', () => {
      const result = detector.detect(makeWebAttrs({ audioHash: undefined }));
      expect(result.indicators).not.toContain('audio_hash:suspicious_value');
    });

    it('should not flag genuine hash values', () => {
      const result = detector.detect(
        makeWebAttrs({
          audioHash: 'f3a1b2c3d4e5f678',
          canvasHash: 'a9b8c7d6e5f40001',
          webglHash: '1234567890abcdef',
        }),
      );
      expect(result.indicators.some((i) => i.endsWith(':suspicious_value'))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Confidence accumulation and threshold logic
  // -------------------------------------------------------------------------

  describe('confidence accumulation', () => {
    it('should clamp confidence to 1.0 with many signals', () => {
      // Pile on every possible emulator signal
      const result = detector.detect({
        screenResolution: '800x600',
        gpuRenderer: 'SwiftShader',
        timezone: 'UTC',
        language: 'en',
        webglHash: '00000000',
        canvasHash: '00000000',
        audioHash: '00000000',
        androidId: '0000000000000000',
        sensorNoise: [0, 0, 0],
        platform: 'android',
        // No playIntegrityToken
      });

      expect(result.confidence).toBeLessThanOrEqual(1.0);
      expect(result.isEmulator).toBe(true);
    });

    it('should set isEmulator=true when confidence >= 0.5 without critical hit', () => {
      // Use only medium/high weight signals, no GPU (no critical)
      // play_integrity absent (0.25) + android_id absent (0.15) + sensor all_zeros (0.25) = 0.65
      const result = detector.detect(
        makeAndroidAttrs({
          gpuRenderer: 'Adreno (TM) 650',    // real GPU — no critical
          playIntegrityToken: undefined,        // HIGH: +0.25
          androidId: undefined,                 // MEDIUM: +0.15
          sensorNoise: [0, 0, 0],              // HIGH: +0.25
        }),
      );

      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      expect(result.isEmulator).toBe(true);
    });

    it('should set isEmulator=false when confidence < 0.5 and no critical hit', () => {
      // Only low-weight signals: audio hash suspicious (0.1) + web resolution (0.15) = 0.25
      const result = detector.detect(
        makeWebAttrs({
          screenResolution: '800x600',  // MEDIUM: +0.15
          audioHash: '00000000',        // LOW: +0.1
        }),
      );

      expect(result.confidence).toBeLessThan(0.5);
      expect(result.isEmulator).toBe(false);
      expect(result.indicators.length).toBeGreaterThan(0);
    });

    it('should return confidence rounded to 3 decimal places', () => {
      const result = detector.detect(makeWebAttrs({ gpuRenderer: 'SwiftShader' }));
      const decimals = result.confidence.toString().split('.')[1] ?? '';
      expect(decimals.length).toBeLessThanOrEqual(3);
    });
  });

  // -------------------------------------------------------------------------
  // EmulatorAnalysis interface contract
  // -------------------------------------------------------------------------

  describe('interface contract', () => {
    it('should always return all three fields', () => {
      const result = detector.detect(makeWebAttrs());
      expect(result).toHaveProperty('isEmulator');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('indicators');
      expect(Array.isArray(result.indicators)).toBe(true);
    });

    it('confidence should always be between 0 and 1', () => {
      const realResult = detector.detect(makeWebAttrs());
      expect(realResult.confidence).toBeGreaterThanOrEqual(0);
      expect(realResult.confidence).toBeLessThanOrEqual(1);

      const emuResult = detector.detect(makeWebAttrs({ gpuRenderer: 'SwiftShader' }));
      expect(emuResult.confidence).toBeGreaterThanOrEqual(0);
      expect(emuResult.confidence).toBeLessThanOrEqual(1);
    });
  });
});
