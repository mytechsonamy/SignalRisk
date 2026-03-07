/**
 * Scenario: Adversarial Bot Evasion
 *
 * Masks headless-browser and automation signals behind realistic browser
 * fingerprints. The scenario sets a desktop user agent, a plausible WebGL
 * vendor/renderer, a realistic canvas hash, and high mouse-movement entropy
 * to defeat bot-detection heuristics that rely on these signals.
 *
 * Adversarial expectation: bot detection should fail to flag these events
 * (low detection rate = adversarial success).
 */

import type { FraudTestEvent, FraudScenario } from '../../types';

const TOTAL_EVENTS = 20;

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

const WEBGL_VENDORS = ['Intel Inc.', 'NVIDIA Corporation', 'AMD', 'Apple Inc.'];
const WEBGL_RENDERERS = [
  'Intel Iris OpenGL Engine',
  'NVIDIA GeForce RTX 3060/PCIe/SSE2',
  'AMD Radeon Pro 5500M OpenGL Engine',
  'Apple M2',
];

/** Deterministic but plausible-looking canvas hash (hex string). */
function canvasFingerprint(seed: number, index: number): string {
  const val = ((seed * 0x9e3779b9 + index * 0x6c62272e) >>> 0).toString(16).padStart(8, '0');
  return `canvas_${val}`;
}

export const botEvasionScenario: FraudScenario = {
  id: 'adversarial-bot-evasion',
  name: 'Adversarial Bot Evasion',
  description:
    '20 automated transactions that mimic human browser behaviour: realistic desktop ' +
    'user agents, plausible WebGL vendor/renderer strings, consistent canvas hashes, ' +
    'and high mouse-movement entropy to evade headless-browser detection.',
  category: 'bot',
  expectedOutcome: {
    minRiskScore: 0.2,
    decision: 'ALLOW',
    minDetectionRate: 0.2,
  },

  async *generate(seed = 0): AsyncGenerator<FraudTestEvent> {
    for (let i = 0; i < TOTAL_EVENTS; i++) {
      const userAgent = USER_AGENTS[i % USER_AGENTS.length];
      const webglVendor = WEBGL_VENDORS[i % WEBGL_VENDORS.length];
      const webglRenderer = WEBGL_RENDERERS[i % WEBGL_RENDERERS.length];
      const canvasHash = canvasFingerprint(seed, i);

      // Mouse movement entropy 0.75–0.95 — high entropy mimics natural human jitter
      const mouseMovementEntropy = 0.75 + (((seed * 3 + i * 7) % 20) / 100);
      // Typing cadence variance in ms — realistic inter-keystroke timing spread
      const typingCadenceVarianceMs = 45 + ((seed * 5 + i * 11) % 80);

      const event: FraudTestEvent = {
        eventId: `evt-adversarial-bot-evasion-${seed}-${i}`,
        merchantId: '00000000-0000-0000-0000-000000000001',
        deviceFingerprint: `bot-evasion-fp-${seed}-${i % 6}`,
        userId: `bot-evasion-user-${seed}-${i}`,
        amount: 89 + ((seed * 7 + i * 13) % 210),
        currency: 'USD',
        metadata: {
          scenarioId: 'adversarial-bot-evasion',
          eventIndex: i,
          user_agent: userAgent,
          webgl_vendor: webglVendor,
          webgl_renderer: webglRenderer,
          canvas_fingerprint: canvasHash,
          mouse_movement_entropy: mouseMovementEntropy,
          typing_cadence_variance_ms: typingCadenceVarianceMs,
          // Suppress obvious headless signals
          webdriver: false,
          navigator_plugins_length: 3 + (i % 5),
          screen_color_depth: 24,
          hardware_concurrency: 8,
          device_memory_gb: 8,
        },
      };

      yield event;
    }
  },
};
