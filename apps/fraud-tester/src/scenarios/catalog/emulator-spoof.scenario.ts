/**
 * Scenario: Emulator Spoof Attack
 *
 * Simulates transactions originating from Android emulators that attempt
 * to disguise themselves as real devices. Indicators include known emulator
 * GPU renderers, ADB-detectable sensor noise signatures, and inconsistent
 * screen/hardware combinations.
 *
 * Expected behaviour: the device intelligence service should flag emulator
 * indicators and escalate to BLOCK.
 */

import type { FraudTestEvent } from '../types';
import type { FraudScenario } from '../types';

const TOTAL_EVENTS = 50;

const EMULATOR_GPU_RENDERERS = [
  'Android Emulator OpenGL ES Translator',
  'Bluestacks OpenGL',
  'ANGLE (Google, Vulkan 1.1.0, Android)',
  'Vivante GC1000',
];

export const emulatorSpoofScenario: FraudScenario = {
  id: 'emulator-spoof',
  name: 'Emulator Spoof Attack',
  description:
    '50 transactions from Android emulators with known GPU renderer strings, ' +
    'ADB sensor noise, and hardware/screen inconsistencies.',
  category: 'device',
  expectedOutcome: {
    minRiskScore: 0.80,
    decision: 'BLOCK',
    minDetectionRate: 0.80,
  },

  async *generate(seed = 0): AsyncGenerator<FraudTestEvent> {
    for (let i = 0; i < TOTAL_EVENTS; i++) {
      const gpuRenderer = EMULATOR_GPU_RENDERERS[i % EMULATOR_GPU_RENDERERS.length];

      const event: FraudTestEvent = {
        eventId: `evt-emulator-spoof-${seed}-${i}`,
        merchantId: 'merchant-test-001',
        deviceFingerprint: `emulator-fp-${seed}-${i % 5}`,
        userId: `emulator-user-${seed}-${i}`,
        amount: 50 + (i % 250),
        currency: 'USD',
        metadata: {
          scenarioId: 'emulator-spoof',
          eventIndex: i,
          gpuRenderer,
          adbEnabled: true,
          sensorNoise: 0.0,
          screenResolution: '1080x1920',
          buildFingerprint: 'generic_x86/sdk_phone_x86/generic_x86:10/QSR1.200303.001/6734798:userdebug/test-keys',
        },
      };

      yield event;
    }
  },
};
