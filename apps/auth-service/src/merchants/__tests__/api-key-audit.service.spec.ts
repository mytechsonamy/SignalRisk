import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyAuditService, ApiKeyAuditEntry } from '../api-key-audit.service';

function makeEntry(overrides: Partial<ApiKeyAuditEntry> = {}): ApiKeyAuditEntry {
  return {
    merchantId: 'merchant-001',
    keyPrefix: 'sk_test_',
    endpoint: '/v1/events',
    timestamp: new Date(),
    ip: '192.168.1.1',
    userAgent: 'TestAgent/1.0',
    ...overrides,
  };
}

describe('ApiKeyAuditService', () => {
  let service: ApiKeyAuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiKeyAuditService],
    }).compile();

    service = module.get<ApiKeyAuditService>(ApiKeyAuditService);
  });

  describe('logUsage', () => {
    it('should add entry to audit log', () => {
      const entry = makeEntry();
      service.logUsage(entry);
      const log = service.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0]).toEqual(entry);
    });

    it('should add multiple entries in order', () => {
      const e1 = makeEntry({ ip: '1.1.1.1' });
      const e2 = makeEntry({ ip: '2.2.2.2' });
      service.logUsage(e1);
      service.logUsage(e2);
      const log = service.getAuditLog();
      expect(log).toHaveLength(2);
      expect(log[0].ip).toBe('1.1.1.1');
      expect(log[1].ip).toBe('2.2.2.2');
    });
  });

  describe('circular buffer', () => {
    it('should cap at MAX_ENTRIES and drop the oldest entry', () => {
      const max = service.MAX_ENTRIES;
      for (let i = 0; i < max + 10; i++) {
        service.logUsage(makeEntry({ ip: `10.0.${Math.floor(i / 255)}.${i % 255}` }));
      }
      const log = service.getAuditLog();
      expect(log).toHaveLength(max);
    });
  });

  describe('getRecentUsage', () => {
    it('should return only entries matching merchantId and keyPrefix', () => {
      service.logUsage(makeEntry({ merchantId: 'merchant-001', keyPrefix: 'sk_test_' }));
      service.logUsage(makeEntry({ merchantId: 'merchant-002', keyPrefix: 'sk_test_' }));
      service.logUsage(makeEntry({ merchantId: 'merchant-001', keyPrefix: 'sk_test_' }));

      const result = service.getRecentUsage('merchant-001', 'sk_test_');
      expect(result).toHaveLength(2);
      expect(result[0].merchantId).toBe('merchant-001');
      expect(result[0].keyPrefix).toBe('sk_test_');
    });

    it('should respect the limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        service.logUsage(makeEntry());
      }
      const result = service.getRecentUsage('merchant-001', 'sk_test_', 3);
      expect(result).toHaveLength(3);
    });

    it('should return empty array if no matching entries', () => {
      const result = service.getRecentUsage('unknown-merchant', 'sk_test_');
      expect(result).toHaveLength(0);
    });
  });

  describe('checkSuspiciousUsage', () => {
    it('should return false when <=5 distinct IPs in last hour', () => {
      for (let i = 1; i <= 5; i++) {
        service.logUsage(makeEntry({ ip: `192.168.1.${i}` }));
      }
      const result = service.checkSuspiciousUsage('merchant-001', 'sk_test_');
      expect(result).toBe(false);
    });

    it('should return true and log warning when >5 distinct IPs in last hour', () => {
      const loggerWarnSpy = jest.spyOn((service as any).logger, 'warn');
      for (let i = 1; i <= 6; i++) {
        service.logUsage(makeEntry({ ip: `192.168.1.${i}` }));
      }
      const result = service.checkSuspiciousUsage('merchant-001', 'sk_test_');
      expect(result).toBe(true);
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Suspicious API key usage'),
      );
    });

    it('should not count IPs older than 1 hour', () => {
      const oldTimestamp = new Date(Date.now() - 2 * 3600000); // 2 hours ago
      // Add 6 entries with old timestamps (should not count)
      for (let i = 1; i <= 6; i++) {
        service.logUsage(makeEntry({ ip: `10.0.0.${i}`, timestamp: oldTimestamp }));
      }
      // Only 2 recent entries from the same IPs
      service.logUsage(makeEntry({ ip: '10.0.0.1' }));
      service.logUsage(makeEntry({ ip: '10.0.0.2' }));

      const result = service.checkSuspiciousUsage('merchant-001', 'sk_test_');
      expect(result).toBe(false); // Only 2 distinct IPs in last hour
    });

    it('should count same IP only once for distinct IP check', () => {
      // 10 entries from same IP → still only 1 distinct IP
      for (let i = 0; i < 10; i++) {
        service.logUsage(makeEntry({ ip: '192.168.1.1' }));
      }
      const result = service.checkSuspiciousUsage('merchant-001', 'sk_test_');
      expect(result).toBe(false);
    });

    it('should only count entries for the specific merchant and keyPrefix', () => {
      // Add 6 IPs for a different merchant
      for (let i = 1; i <= 6; i++) {
        service.logUsage(makeEntry({ merchantId: 'other-merchant', ip: `192.168.1.${i}` }));
      }
      const result = service.checkSuspiciousUsage('merchant-001', 'sk_test_');
      expect(result).toBe(false); // Different merchant, should not trigger
    });
  });
});
