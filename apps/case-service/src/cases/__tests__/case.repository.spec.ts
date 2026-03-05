import { CaseRepository } from '../case.repository';
import { CreateCaseData, UpdateCaseData } from '../case.types';

// ---------------------------------------------------------------------------
// Mock pg.Pool
// ---------------------------------------------------------------------------

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({
  query: mockQuery,
  release: mockRelease,
});

const mockPool = {
  connect: mockConnect,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCreateData(overrides: Partial<CreateCaseData> = {}): CreateCaseData {
  return {
    merchantId: 'merchant-001',
    decisionId: 'req-001',
    entityId: 'entity-001',
    action: 'BLOCK',
    riskScore: 80,
    riskFactors: [
      { signal: 'velocity', value: 10, contribution: 0.5, description: 'High velocity' },
    ],
    status: 'OPEN',
    priority: 'HIGH',
    slaDeadline: new Date('2026-03-07T08:00:00Z'),
    ...overrides,
  };
}

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'case-001',
    merchant_id: 'merchant-001',
    decision_id: 'req-001',
    entity_id: 'entity-001',
    action: 'BLOCK',
    risk_score: '80',
    risk_factors: JSON.stringify([]),
    status: 'OPEN',
    priority: 'HIGH',
    sla_deadline: '2026-03-07T08:00:00Z',
    assigned_to: null,
    resolution: null,
    resolution_notes: null,
    resolved_at: null,
    created_at: '2026-03-06T00:00:00Z',
    updated_at: '2026-03-06T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CaseRepository', () => {
  let repository: CaseRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new CaseRepository(mockPool as never);
  });

  // -------------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------------

  describe('create()', () => {
    it('should call set_config first, then insert case', async () => {
      const row = makeRow();
      // set_config call returns empty result, insert returns the row
      mockQuery
        .mockResolvedValueOnce({ rows: [] })   // set_config
        .mockResolvedValueOnce({ rows: [row] }); // INSERT

      const data = makeCreateData();
      const result = await repository.create(data);

      // Verify set_config was called first
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        "SELECT set_config('app.merchant_id', $1, true)",
        ['merchant-001'],
      );

      // Verify INSERT was second call
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO cases');

      // Verify returned case
      expect(result.id).toBe('case-001');
      expect(result.merchantId).toBe('merchant-001');
      expect(result.action).toBe('BLOCK');
      expect(result.priority).toBe('HIGH');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should release client even on error', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // set_config
        .mockRejectedValueOnce(new Error('DB error')); // INSERT fails

      await expect(repository.create(makeCreateData())).rejects.toThrow('DB error');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // findMany()
  // -------------------------------------------------------------------------

  describe('findMany()', () => {
    it('should apply status filter in WHERE clause', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })                          // set_config
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })             // COUNT
        .mockResolvedValueOnce({ rows: [makeRow()] });                // SELECT

      await repository.findMany({
        merchantId: 'merchant-001',
        status: 'OPEN',
        page: 1,
        limit: 20,
      });

      const countCall = mockQuery.mock.calls[1];
      expect(countCall[0]).toContain('status = $2');
      expect(countCall[1]).toContain('OPEN');
    });

    it('should apply priority filter in WHERE clause', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      await repository.findMany({
        merchantId: 'merchant-001',
        priority: 'HIGH',
        page: 1,
        limit: 20,
      });

      const countCall = mockQuery.mock.calls[1];
      expect(countCall[0]).toContain('priority = $2');
      expect(countCall[1]).toContain('HIGH');
    });

    it('should apply assignedTo filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      await repository.findMany({
        merchantId: 'merchant-001',
        assignedTo: 'analyst-001',
        page: 1,
        limit: 20,
      });

      const countCall = mockQuery.mock.calls[1];
      expect(countCall[0]).toContain('assigned_to = $2');
      expect(countCall[1]).toContain('analyst-001');
    });

    it('should apply search filter using ILIKE on entityId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      await repository.findMany({
        merchantId: 'merchant-001',
        search: 'entity-x',
        page: 1,
        limit: 20,
      });

      const countCall = mockQuery.mock.calls[1];
      expect(countCall[0]).toContain('entity_id ILIKE $2');
      expect(countCall[1]).toContain('%entity-x%');
    });

    it('should calculate correct pagination: page 1 = OFFSET 0', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 50 }] })
        .mockResolvedValueOnce({ rows: [] });

      await repository.findMany({
        merchantId: 'merchant-001',
        page: 1,
        limit: 10,
      });

      const selectCall = mockQuery.mock.calls[2];
      const values = selectCall[1];
      // limit=10, offset=0 should be the last two values
      expect(values[values.length - 2]).toBe(10);
      expect(values[values.length - 1]).toBe(0);
    });

    it('should calculate correct pagination: page 2 = OFFSET limit', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 50 }] })
        .mockResolvedValueOnce({ rows: [] });

      await repository.findMany({
        merchantId: 'merchant-001',
        page: 2,
        limit: 10,
      });

      const selectCall = mockQuery.mock.calls[2];
      const values = selectCall[1];
      expect(values[values.length - 2]).toBe(10);
      expect(values[values.length - 1]).toBe(10); // page 2, limit 10 → offset 10
    });

    it('should cap limit at 100', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      await repository.findMany({
        merchantId: 'merchant-001',
        page: 1,
        limit: 200,
      });

      const selectCall = mockQuery.mock.calls[2];
      const values = selectCall[1];
      expect(values[values.length - 2]).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // bulkUpdate()
  // -------------------------------------------------------------------------

  describe('bulkUpdate()', () => {
    it('should update correct count of rows', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })             // set_config
        .mockResolvedValueOnce({ rowCount: 3 });         // UPDATE

      const updateData: UpdateCaseData = { status: 'RESOLVED' };
      const count = await repository.bulkUpdate(
        ['c1', 'c2', 'c3'],
        'merchant-001',
        updateData,
      );

      expect(count).toBe(3);

      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE cases');
      expect(updateCall[0]).toContain('IN (');
    });

    it('should return 0 when ids array is empty', async () => {
      const count = await repository.bulkUpdate([], 'merchant-001', {});
      expect(count).toBe(0);
      // Should not call connect at all
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should include all id placeholders in the IN clause', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 2 });

      await repository.bulkUpdate(['c1', 'c2'], 'merchant-001', { status: 'ESCALATED' });

      const updateCall = mockQuery.mock.calls[1];
      const sql = updateCall[0] as string;
      // Should have placeholders for both ids
      expect(sql).toContain('$1');
      expect(sql).toContain('$2');
      // merchant_id should be the last param
      const values = updateCall[1] as unknown[];
      expect(values).toContain('c1');
      expect(values).toContain('c2');
      expect(values).toContain('merchant-001');
    });
  });
});
