import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '../..');

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath));
}

describe('Compliance cross-reference validation', () => {
  describe('Security controls', () => {
    it('security.yml CI workflow exists', () => {
      expect(fileExists('.github/workflows/security.yml')).toBe(true);
    });

    it('KeyRotationService exists', () => {
      expect(fileExists('apps/auth-service/src/auth/key-rotation.service.ts')).toBe(true);
    });

    it('MerchantRateLimitService exists', () => {
      expect(fileExists('apps/auth-service/src/rate-limit/merchant-rate-limit.service.ts')).toBe(true);
    });

    it('IpRateLimitService exists', () => {
      expect(fileExists('apps/event-collector/src/backpressure/ip-rate-limit.service.ts')).toBe(true);
    });

    it('signal-fetchers (SSRF guard) exists', () => {
      expect(fileExists('apps/decision-service/src/decision/signal-fetchers.ts')).toBe(true);
    });

    it('DecisionGateway (WsJwtGuard) exists', () => {
      expect(fileExists('apps/decision-service/src/decision/decision.gateway.ts')).toBe(true);
    });
  });

  describe('GDPR erasure and retention', () => {
    it('PurgeService (right to erasure) exists', () => {
      expect(fileExists('apps/auth-service/src/merchants/purge.service.ts')).toBe(true);
    });

    it('DataRetentionService (case purge) exists', () => {
      expect(fileExists('apps/case-service/src/retention/data-retention.service.ts')).toBe(true);
    });

    it('DeviceRetentionService exists', () => {
      expect(fileExists('apps/device-intel-service/src/retention/device-retention.service.ts')).toBe(true);
    });
  });

  describe('Observability and audit', () => {
    it('Jaeger K8s manifest exists', () => {
      expect(fileExists('infrastructure/observability/jaeger.yaml')).toBe(true);
    });

    it('ApiKeyAuditService exists', () => {
      expect(fileExists('apps/auth-service/src/merchants/api-key-audit.service.ts')).toBe(true);
    });
  });

  describe('Webhook integrity', () => {
    it('WebhookService (HMAC-SHA256) exists', () => {
      // webhook-delivery.service.ts implements HMAC-SHA256 signing
      expect(fileExists('apps/webhook-service/src/webhook/webhook-delivery.service.ts')).toBe(true);
    });
  });

  describe('Compliance documentation', () => {
    it('PCI-DSS scoping document exists', () => {
      expect(fileExists('docs/compliance/pci-dss-scoping.md')).toBe(true);
    });

    it('GDPR data flow document exists', () => {
      expect(fileExists('docs/compliance/gdpr-data-flow.md')).toBe(true);
    });

    it('Security controls matrix exists', () => {
      expect(fileExists('docs/compliance/security-controls-matrix.md')).toBe(true);
    });

    it('PCI-DSS doc references key-rotation.service.ts', () => {
      const doc = fs.readFileSync(path.join(ROOT, 'docs/compliance/pci-dss-scoping.md'), 'utf-8');
      expect(doc).toContain('key-rotation.service.ts');
    });

    it('GDPR doc references PurgeService endpoint', () => {
      const doc = fs.readFileSync(path.join(ROOT, 'docs/compliance/gdpr-data-flow.md'), 'utf-8');
      expect(doc).toContain('/v1/merchants/:id/purge');
    });

    it('Security matrix covers all OWASP Top 10 categories (A01-A10)', () => {
      const doc = fs.readFileSync(path.join(ROOT, 'docs/compliance/security-controls-matrix.md'), 'utf-8');
      for (let i = 1; i <= 10; i++) {
        const code = `A${String(i).padStart(2, '0')}`;
        expect(doc).toContain(code);
      }
    });
  });

  describe('DR and resilience', () => {
    it('Disaster recovery runbook exists', () => {
      expect(fileExists('docs/runbooks/disaster-recovery.md')).toBe(true);
    });

    it('PodDisruptionBudget manifest exists', () => {
      expect(fileExists('infrastructure/k8s/poddisruptionbudget.yaml')).toBe(true);
    });

    it('DR health-check script exists', () => {
      expect(fileExists('scripts/dr/health-check.sh')).toBe(true);
    });

    it('compliance-check script exists', () => {
      expect(fileExists('scripts/compliance-check.sh')).toBe(true);
    });
  });
});
