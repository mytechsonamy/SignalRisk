/**
 * Unit tests for DecisionStoreService — prior-decision memory (ADR-011 + ADR-009).
 *
 * Tests the getPriorDecisionMemory method with typed entity support.
 */

import { DecisionStoreService } from '../decision-store.service';

// Mock pg Pool
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({
  query: mockQuery,
  release: mockRelease,
});

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    query: mockQuery,
  })),
}));

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'database') {
      return {
        host: 'localhost',
        port: 5432,
        username: 'signalrisk',
        password: 'signalrisk',
        database: 'signalrisk',
      };
    }
    return undefined;
  }),
};

describe('DecisionStoreService.getPriorDecisionMemory', () => {
  let service: DecisionStoreService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DecisionStoreService(mockConfigService as never);

    // Default: set_config and SELECT succeed
    mockQuery
      .mockResolvedValueOnce({}) // SET LOCAL statement_timeout
      .mockResolvedValueOnce({}) // set_config
      .mockResolvedValueOnce({
        rows: [{ block_count_30d: '3', review_count_7d: '5' }],
      });
  });

  it('returns BLOCK and REVIEW counts from the decisions table', async () => {
    const result = await service.getPriorDecisionMemory('merchant-1', 'entity-1');

    expect(result).toEqual({
      previousBlockCount30d: 3,
      previousReviewCount7d: 5,
    });
  });

  it('sets 50ms statement_timeout', async () => {
    await service.getPriorDecisionMemory('merchant-1', 'entity-1');

    expect(mockQuery).toHaveBeenCalledWith('SET LOCAL statement_timeout = 50');
  });

  it('sets RLS tenant isolation via set_config', async () => {
    await service.getPriorDecisionMemory('merchant-1', 'entity-1');

    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT set_config('app.merchant_id', $1, true)",
      ['merchant-1'],
    );
  });

  it('queries with entity_id and entity_type params (default: customer)', async () => {
    await service.getPriorDecisionMemory('merchant-1', 'entity-1');

    // Third query call is the SELECT
    const selectCall = mockQuery.mock.calls[2];
    expect(selectCall[1]).toEqual(['merchant-1', 'entity-1', 'customer']);
    expect(selectCall[0]).toContain('entity_id');
    expect(selectCall[0]).toContain('entity_type');
    expect(selectCall[0]).toContain("INTERVAL '30 days'");
  });

  it('queries with device entity type when specified', async () => {
    await service.getPriorDecisionMemory('merchant-1', 'device-abc', 'device');

    const selectCall = mockQuery.mock.calls[2];
    expect(selectCall[1]).toEqual(['merchant-1', 'device-abc', 'device']);
  });

  it('queries with ip entity type when specified', async () => {
    await service.getPriorDecisionMemory('merchant-1', '10.0.0.1', 'ip');

    const selectCall = mockQuery.mock.calls[2];
    expect(selectCall[1]).toEqual(['merchant-1', '10.0.0.1', 'ip']);
  });

  it('returns fallback {0, 0} when query throws', async () => {
    mockQuery.mockReset();
    mockConnect.mockResolvedValueOnce({
      query: jest.fn().mockRejectedValue(new Error('DB down')),
      release: mockRelease,
    });

    const result = await service.getPriorDecisionMemory('merchant-1', 'entity-1');

    expect(result).toEqual({
      previousBlockCount30d: 0,
      previousReviewCount7d: 0,
    });
  });

  it('returns fallback when no rows returned', async () => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce({}) // SET LOCAL
      .mockResolvedValueOnce({}) // set_config
      .mockResolvedValueOnce({ rows: [] }); // empty result

    const result = await service.getPriorDecisionMemory('merchant-1', 'entity-1');

    expect(result).toEqual({
      previousBlockCount30d: 0,
      previousReviewCount7d: 0,
    });
  });

  it('releases client connection after successful query', async () => {
    await service.getPriorDecisionMemory('merchant-1', 'entity-1');

    expect(mockRelease).toHaveBeenCalled();
  });

  it('entity type mismatch returns zero counts', async () => {
    // Customer entity has 3 blocks, but querying device should return 0
    // (because entity_type filter excludes customer rows)
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce({}) // SET LOCAL
      .mockResolvedValueOnce({}) // set_config
      .mockResolvedValueOnce({
        rows: [{ block_count_30d: '0', review_count_7d: '0' }],
      });

    const result = await service.getPriorDecisionMemory('merchant-1', 'entity-1', 'device');

    expect(result).toEqual({
      previousBlockCount30d: 0,
      previousReviewCount7d: 0,
    });
    // Verify entity_type was passed
    const selectCall = mockQuery.mock.calls[2];
    expect(selectCall[1][2]).toBe('device');
  });
});
