import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.join(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));
const size = (p: string) => fs.statSync(path.join(ROOT, p)).size;

describe('Developer documentation validation', () => {
  describe('File existence', () => {
    it('getting-started.md exists', () => {
      expect(exists('docs/dev/getting-started.md')).toBe(true);
    });

    it('web-sdk-reference.md exists', () => {
      expect(exists('docs/dev/web-sdk-reference.md')).toBe(true);
    });

    it('mobile-sdk-reference.md exists', () => {
      expect(exists('docs/dev/mobile-sdk-reference.md')).toBe(true);
    });

    it('api-reference.md exists', () => {
      expect(exists('docs/dev/api-reference.md')).toBe(true);
    });

    it('architecture.md exists', () => {
      expect(exists('docs/dev/architecture.md')).toBe(true);
    });

    it('validate-docs.sh exists', () => {
      expect(exists('scripts/validate-docs.sh')).toBe(true);
    });
  });

  describe('Content validation — getting-started.md', () => {
    it('contains npm install snippet', () => {
      expect(read('docs/dev/getting-started.md')).toContain('npm install @signalrisk/web-sdk');
    });

    it('contains webhook verification example', () => {
      expect(read('docs/dev/getting-started.md')).toContain('x-signalrisk-signature');
    });

    it('references the other documentation files', () => {
      const doc = read('docs/dev/getting-started.md');
      expect(doc).toContain('web-sdk-reference.md');
      expect(doc).toContain('mobile-sdk-reference.md');
      expect(doc).toContain('api-reference.md');
    });
  });

  describe('Content validation — web-sdk-reference.md', () => {
    it('documents all EventType values', () => {
      const doc = read('docs/dev/web-sdk-reference.md');
      ['PAGE_VIEW', 'CLICK', 'FORM_SUBMIT', 'CHECKOUT', 'LOGIN', 'LOGOUT'].forEach(t => {
        expect(doc).toContain(t);
      });
    });

    it('documents FingerprintCollector attributes', () => {
      const doc = read('docs/dev/web-sdk-reference.md');
      expect(doc).toContain('screenResolution');
      expect(doc).toContain('gpuRenderer');
      expect(doc).toContain('webglHash');
      expect(doc).toContain('canvasHash');
    });

    it('documents BehavioralTracker metrics', () => {
      const doc = read('docs/dev/web-sdk-reference.md');
      expect(doc).toContain('timingCv');
      expect(doc).toContain('navigationEntropy');
      expect(doc).toContain('mouseJitter');
    });

    it('documents SignalRiskConfig options including merchantId', () => {
      const doc = read('docs/dev/web-sdk-reference.md');
      expect(doc).toContain('merchantId');
      expect(doc).toContain('apiKey');
      expect(doc).toContain('debug');
    });
  });

  describe('Content validation — mobile-sdk-reference.md', () => {
    it('references SignalRiskClient', () => {
      expect(read('docs/dev/mobile-sdk-reference.md')).toContain('SignalRiskClient');
    });

    it('documents MobileFingerprintData fields', () => {
      const doc = read('docs/dev/mobile-sdk-reference.md');
      expect(doc).toContain('fingerprint');
      expect(doc).toContain('platform');
      expect(doc).toContain('screenSize');
      expect(doc).toContain('locale');
      expect(doc).toContain('timezone');
      expect(doc).toContain('deviceId');
    });

    it('documents AsyncStorage key for device ID persistence', () => {
      expect(read('docs/dev/mobile-sdk-reference.md')).toContain('signalrisk_device_id');
    });

    it('documents iOS and Android differences', () => {
      const doc = read('docs/dev/mobile-sdk-reference.md');
      expect(doc).toContain('ios');
      expect(doc).toContain('android');
    });
  });

  describe('Content validation — api-reference.md', () => {
    it('mentions /v1/events endpoint', () => {
      expect(read('docs/dev/api-reference.md')).toContain('/v1/events');
    });

    it('mentions /v1/decisions endpoint', () => {
      expect(read('docs/dev/api-reference.md')).toContain('/v1/decisions');
    });

    it('mentions /v1/cases endpoint', () => {
      expect(read('docs/dev/api-reference.md')).toContain('/v1/cases');
    });

    it('mentions X-SignalRisk-Signature', () => {
      expect(read('docs/dev/api-reference.md')).toContain('X-SignalRisk-Signature');
    });

    it('documents decision action values', () => {
      const doc = read('docs/dev/api-reference.md');
      expect(doc).toContain('ALLOW');
      expect(doc).toContain('REVIEW');
      expect(doc).toContain('BLOCK');
    });

    it('documents auth endpoints', () => {
      const doc = read('docs/dev/api-reference.md');
      expect(doc).toContain('/v1/auth/token');
    });
  });

  describe('Content validation — architecture.md', () => {
    it('lists all core service names', () => {
      const doc = read('docs/dev/architecture.md');
      [
        'event-collector',
        'device-intel',
        'velocity-service',
        'behavioral',
        'decision-service',
        'case-service',
        'webhook-service',
        'auth-service',
        'rule-engine',
        'graph-intel',
        'feature-flag',
      ].forEach(s => {
        expect(doc).toContain(s);
      });
    });

    it('mentions infrastructure components', () => {
      const doc = read('docs/dev/architecture.md');
      expect(doc).toContain('PostgreSQL');
      expect(doc).toContain('Redis');
      expect(doc).toContain('Kafka');
      expect(doc).toContain('Neo4j');
    });

    it('includes Kafka topic names', () => {
      const doc = read('docs/dev/architecture.md');
      expect(doc).toContain('events');
      expect(doc).toContain('decisions');
    });
  });

  describe('File size checks', () => {
    it('getting-started.md is > 500 bytes', () => {
      expect(size('docs/dev/getting-started.md')).toBeGreaterThan(500);
    });

    it('web-sdk-reference.md is > 500 bytes', () => {
      expect(size('docs/dev/web-sdk-reference.md')).toBeGreaterThan(500);
    });

    it('mobile-sdk-reference.md is > 500 bytes', () => {
      expect(size('docs/dev/mobile-sdk-reference.md')).toBeGreaterThan(500);
    });

    it('api-reference.md is > 500 bytes', () => {
      expect(size('docs/dev/api-reference.md')).toBeGreaterThan(500);
    });

    it('architecture.md is > 500 bytes', () => {
      expect(size('docs/dev/architecture.md')).toBeGreaterThan(500);
    });
  });

  describe('Script validation', () => {
    it('validate-docs.sh is executable', () => {
      const stats = fs.statSync(path.join(ROOT, 'scripts/validate-docs.sh'));
      // Check owner execute bit (0o100)
      const isExecutable = (stats.mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });

    it('validate-docs.sh passes when run against the repo root', () => {
      const scriptPath = path.join(ROOT, 'scripts/validate-docs.sh');
      expect(() => {
        execSync(`bash "${scriptPath}" "${ROOT}"`, { stdio: 'pipe' });
      }).not.toThrow();
    });
  });
});
