import { NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { DataExportService } from '../data-export.service';

// ---------------------------------------------------------------------------
// Mock pg Pool
// ---------------------------------------------------------------------------

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({ query: mockQuery, release: mockRelease });
const mockPool = { connect: mockConnect } as unknown as Pool;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMerchantRow() {
  return {
    id: 'merchant-001',
    name: 'Acme Corp',
    email: 'admin@acme.com',
    created_at: new Date('2025-01-01T00:00:00Z'),
    status: 'active',
  };
}

function makeApiKeyRow(overrides: Record<string, unknown> = {}) {
  return {
    prefix: 'sk_test_',
    created_at: new Date('2025-01-02T00:00:00Z'),
    last_used_at: new Date('2025-06-01T00:00:00Z'),
    ...overrides,
  };
}

function makeAuditRow(overrides: Record<string, unknown> = {}) {
  return {
    action: 'merchant_created',
    created_at: new Date('2025-01-01T01:00:00Z'),
    ip_address: '192.168.1.1',
    details: { note: 'test' },
    ...overrides,
  };
}

function setupMockQueries({
  merchantRows = [makeMerchantRow()],
  apiKeyRows = [makeApiKeyRow()],
  auditRows = [makeAuditRow()],
  usageRows = [] as unknown[],
} = {}) {
  mockQuery
    .mockResolvedValueOnce({ rows: merchantRows })  // merchant query
    .mockResolvedValueOnce({ rows: apiKeyRows })     // api_keys query
    .mockResolvedValueOnce({ rows: auditRows })      // audit_log query
    .mockResolvedValueOnce({ rows: usageRows });     // usage query
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DataExportService', () => {
  let service: DataExportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DataExportService(mockPool);
  });

  it('returns export with correct merchantId', async () => {
    setupMockQueries();
    const result = await service.exportMerchantData('merchant-001');
    expect(result.merchantId).toBe('merchant-001');
  });

  it('export includes merchant name and email', async () => {
    setupMockQueries();
    const result = await service.exportMerchantData('merchant-001');
    expect(result.merchant.name).toBe('Acme Corp');
    expect(result.merchant.email).toBe('admin@acme.com');
  });

  it('export strips raw API keys — only prefix (8 chars)', async () => {
    setupMockQueries({
      apiKeyRows: [makeApiKeyRow({ prefix: 'sk_test_' })],
    });
    const result = await service.exportMerchantData('merchant-001');
    expect(result.apiKeys).toHaveLength(1);
    expect(result.apiKeys[0].prefix).toBe('sk_test_');
    // Ensure the prefix is at most 8 characters long
    expect(result.apiKeys[0].prefix.length).toBeLessThanOrEqual(8);
  });

  it('export includes audit log entries', async () => {
    const auditRow = makeAuditRow({ action: 'login', ip_address: '10.0.0.1' });
    setupMockQueries({ auditRows: [auditRow] });
    const result = await service.exportMerchantData('merchant-001');
    expect(result.auditLog).toHaveLength(1);
    expect(result.auditLog[0].action).toBe('login');
    expect(result.auditLog[0].ip).toBe('10.0.0.1');
  });

  it('throws NotFoundException when merchant not found (rows.length === 0)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(service.exportMerchantData('unknown-id')).rejects.toThrow(NotFoundException);
  });

  it('throws error message containing "not found" when merchant missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(service.exportMerchantData('unknown-id')).rejects.toThrow('not found');
  });

  it('exportId has correct format: starts with export-', async () => {
    setupMockQueries();
    const result = await service.exportMerchantData('merchant-001');
    expect(result.exportId).toMatch(/^export-/);
  });

  it('generatedAt is valid ISO timestamp', async () => {
    setupMockQueries();
    const result = await service.exportMerchantData('merchant-001');
    expect(() => new Date(result.generatedAt)).not.toThrow();
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
  });

  it('apiKeys array includes createdAt and lastUsedAt', async () => {
    setupMockQueries();
    const result = await service.exportMerchantData('merchant-001');
    expect(result.apiKeys[0]).toHaveProperty('createdAt');
    expect(result.apiKeys[0]).toHaveProperty('lastUsedAt');
    expect(result.apiKeys[0].createdAt).toBe('2025-01-02T00:00:00.000Z');
    expect(result.apiKeys[0].lastUsedAt).toBe('2025-06-01T00:00:00.000Z');
  });

  it('empty auditLog handled gracefully (returns empty array)', async () => {
    setupMockQueries({ auditRows: [] });
    const result = await service.exportMerchantData('merchant-001');
    expect(result.auditLog).toEqual([]);
  });

  it('client.release() called in finally block', async () => {
    setupMockQueries();
    await service.exportMerchantData('merchant-001');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('client.release() called even when query throws', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [makeMerchantRow()] })
      .mockRejectedValueOnce(new Error('DB connection error'));
    await expect(service.exportMerchantData('merchant-001')).rejects.toThrow('DB connection error');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('merchant with deleted_at IS NULL filter applied', async () => {
    setupMockQueries();
    await service.exportMerchantData('merchant-001');
    const merchantQueryCall = mockQuery.mock.calls[0];
    expect(merchantQueryCall[0]).toContain('deleted_at IS NULL');
    expect(merchantQueryCall[1]).toEqual(['merchant-001']);
  });

  it('limit 1000 applied to audit log query', async () => {
    setupMockQueries();
    await service.exportMerchantData('merchant-001');
    const auditQueryCall = mockQuery.mock.calls[2];
    expect(auditQueryCall[0]).toContain('LIMIT 1000');
  });
});
