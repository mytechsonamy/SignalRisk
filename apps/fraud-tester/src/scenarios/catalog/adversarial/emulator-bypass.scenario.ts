/**
 * Scenario: Adversarial Emulator Bypass
 *
 * A more aggressive evolution of emulator-spoof. Instead of using obvious
 * emulator GPU strings, events present highly realistic device metadata that
 * mirrors a genuine Apple-silicon or Snapdragon handset — high-fidelity
 * sensor noise, plausible battery and thermal readings, and consistent
 * hardware/screen pairings. The goal is to slip past device-intelligence
 * heuristics that rely on known-bad renderer lists.
 *
 * Adversarial expectation: the system FAILS to detect these events
 * (low detection rate = adversarial success).
 */

import type { FraudTestEvent, FraudScenario } from '../../types';

const TOTAL_EVENTS = 30;

const REALISTIC_GPU_RENDERERS = [
  'Apple M2',
  'Apple M1 Pro',
  'Adreno (TM) 740',
  'Mali-G715-Immortalis MC11',
  'Apple A16 GPU',
  'Adreno (TM) 650',
];

const THERMAL_STATES = ['nominal', 'fair', 'fair', 'nominal', 'fair'] as const;
const SCREEN_RESOLUTIONS = [
  '1179x2556', // iPhone 15 Pro
  '1290x2796', // iPhone 15 Pro Max
  '1440x3088', // Samsung S23 Ultra
  '1080x2340', // Pixel 8
  '1080x2400', // OnePlus 12
];
const BUILD_FINGERPRINTS = [
  'google/cheetah/cheetah:14/UQ1A.240105.004/11269751:user/release-keys',
  'samsung/dm3qxxx/dm3q:14/UP1A.231005.007/S918BXXU3CXA1:user/release-keys',
  'OnePlus/CPH2573/OP5574L1:14/UP1A.231005.007/R_14.0.0.200(EX01):user/release-keys',
];

export const emulatorBypassScenario: FraudScenario = {
  id: 'adversarial-emulator-bypass',
  name: 'Adversarial Emulator Bypass',
  description:
    '30 transactions that mimic genuine high-end devices with realistic GPU renderers, ' +
    'plausible thermal/battery states, and consistent hardware fingerprints to evade ' +
    'emulator detection heuristics.',
  category: 'device',
  expectedOutcome: {
    minRiskScore: 0,
    decision: 'ALLOW',
    minDetectionRate: 0,
  },

  async *generate(seed = 0): AsyncGenerator<FraudTestEvent> {
    for (let i = 0; i < TOTAL_EVENTS; i++) {
      const gpuRenderer = REALISTIC_GPU_RENDERERS[i % REALISTIC_GPU_RENDERERS.length];
      const thermalState = THERMAL_STATES[i % THERMAL_STATES.length];
      const screenResolution = SCREEN_RESOLUTIONS[i % SCREEN_RESOLUTIONS.length];
      const buildFingerprint = BUILD_FINGERPRINTS[i % BUILD_FINGERPRINTS.length];

      // Sensor noise in human-like range (0.001–0.004) rather than the flat 0.0 seen in emulators
      const sensorNoise = 0.001 + (((seed * 7 + i * 13) % 30) / 10000);
      // Battery level between 0.55 and 0.95 — realistic mid-day device
      const batteryLevel = 0.55 + (((seed * 3 + i * 17) % 40) / 100);

      const event: FraudTestEvent = {
        eventId: `evt-adversarial-emulator-bypass-${seed}-${i}`,
        merchantId: 'merchant-test-001',
        deviceFingerprint: `real-device-fp-${seed}-${i % 10}`,
        userId: `legitimate-user-${seed}-${i}`,
        amount: 120 + ((seed * 5 + i * 11) % 380),
        currency: 'USD',
        metadata: {
          scenarioId: 'adversarial-emulator-bypass',
          eventIndex: i,
          gpu_renderer: gpuRenderer,
          thermal_state: thermalState,
          sensor_noise: sensorNoise,
          battery_level: batteryLevel,
          screenResolution,
          buildFingerprint,
          adbEnabled: false,
          usb_debugging: false,
          developer_options: false,
        },
      };

      yield event;
    }
  },
};
