import { Pool } from 'pg';
import { CaseExportService } from '../case-export.service';

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

function makeCaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-001',
    merchant_id: 'merchant-001',
    entity_id: 'entity-001',
    action: 'BLOCK',
    risk_score: '80',
    status: 'OPEN',
    priority: 'HIGH',
    created_at: new Date('2025-06-01T00:00:00Z'),
    updated_at: new Date('2025-06-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CaseExportService', () => {
  let service: CaseExportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CaseExportService(mockPool);
  });

  it('returns cases for the given entityId', async () => {
    const row = makeCaseRow();
    mockQuery
      .mockResolvedValueOnce({ rows: [] })       // set_config
      .mockResolvedValueOnce({ rows: [row] });    // SELECT

    const result = await service.exportEntityCases('merchant-001', 'entity-001');
    expect(result).toHaveLength(1);
    expect(result[0].entity_id).toBe('entity-001');
  });

  it('applies RLS set_config before query', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await service.exportEntityCases('merchant-001', 'entity-001');

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      "SELECT set_config('app.merchant_id', $1, true)",
      ['merchant-001'],
    );
  });

  it('returns empty array when no cases found', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })   // set_config
      .mockResolvedValueOnce({ rows: [] });  // SELECT — no cases

    const result = await service.exportEntityCases('merchant-001', 'entity-999');
    expect(result).toEqual([]);
  });

  it('filters by deleted_at IS NULL', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await service.exportEntityCases('merchant-001', 'entity-001');

    const selectCall = mockQuery.mock.calls[1];
    expect(selectCall[0]).toContain('deleted_at IS NULL');
  });

  it('client.release() called in finally block', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await service.exportEntityCases('merchant-001', 'entity-001');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('orders results by created_at DESC', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await service.exportEntityCases('merchant-001', 'entity-001');

    const selectCall = mockQuery.mock.calls[1];
    expect(selectCall[0]).toContain('ORDER BY created_at DESC');
  });

  it('client.release() called even when query throws', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('DB error'));

    await expect(service.exportEntityCases('merchant-001', 'entity-001')).rejects.toThrow('DB error');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});
