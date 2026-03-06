import { DataRetentionService } from '../data-retention.service';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';

// Workaround: pg's query() is heavily overloaded — use a simpler interface for mocking
interface MockClient {
  query: jest.Mock;
  release: jest.Mock;
}

describe('DataRetentionService', () => {
  let service: DataRetentionService;
  let mockPool: { connect: jest.Mock };
  let mockClient: MockClient;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          CASES_RETENTION_DAYS: 365,
          DEVICES_RETENTION_DAYS: 730,
          PURGE_BATCH_SIZE: 1000,
        };
        return config[key] ?? defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new DataRetentionService(mockPool as unknown as Pool, mockConfigService);
  });

  describe('runRetentionJob', () => {
    it('should delete resolved cases older than the retention window', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rowCount: 5, rows: [] } as any) // DELETE
        .mockResolvedValueOnce({ rowCount: 1, rows: [] } as any); // audit_log INSERT

      const result = await service.runRetentionJob();

      expect(result.purgedCases).toBe(5);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'RESOLVED'"),
        expect.any(Array),
      );
    });

    it('should return zero when no cases qualify for purge', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] } as any);

      const result = await service.runRetentionJob();

      expect(result.purgedCases).toBe(0);
      // audit_log should NOT be written when nothing was purged
      expect(mockClient.query).toHaveBeenCalledTimes(1);
    });

    it('should always release the client after the job runs', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 3, rows: [] } as any)
        .mockResolvedValueOnce({ rowCount: 1, rows: [] } as any);

      await service.runRetentionJob();

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('purgeOldCases', () => {
    it('should return the number of purged cases', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rowCount: 10, rows: [] } as any)
        .mockResolvedValueOnce({ rowCount: 1, rows: [] } as any);

      const count = await service.purgeOldCases();

      expect(count).toBe(10);
    });

    it('should use the configured batch size as LIMIT', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] } as any);

      await service.purgeOldCases();

      const callArgs = mockClient.query.mock.calls[0];
      expect(callArgs[1]).toContain(1000); // batch size value
    });

    it('should log an audit entry after a successful purge', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rowCount: 7, rows: [] } as any)
        .mockResolvedValueOnce({ rowCount: 1, rows: [] } as any);

      await service.purgeOldCases();

      const auditCall = mockClient.query.mock.calls[1];
      expect(auditCall[0]).toContain('audit_log');
      expect(auditCall[1]).toContain('RETENTION_PURGE');
    });

    it('should add WHERE merchant_id condition when merchantId is provided', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rowCount: 3, rows: [] } as any)
        .mockResolvedValueOnce({ rowCount: 1, rows: [] } as any);

      await service.purgeOldCases('merchant-abc');

      const deleteCall = mockClient.query.mock.calls[0];
      expect(deleteCall[0]).toContain('merchant_id');
      expect(deleteCall[1]).toContain('merchant-abc');
    });

    it('should NOT add WHERE merchant_id when no merchantId provided', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] } as any);

      await service.purgeOldCases();

      const deleteCall = mockClient.query.mock.calls[0];
      // Without merchantId, only batchSize is in the params array
      expect(deleteCall[1]).toEqual([1000]);
    });

    it('should use configured retention days in the query', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] } as any);

      await service.purgeOldCases();

      const deleteCall = mockClient.query.mock.calls[0];
      expect(deleteCall[0]).toContain('365 days');
    });

    it('should release the client even when query throws', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('DB error'));

      await expect(service.purgeOldCases()).rejects.toThrow('DB error');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should handle rowCount of null gracefully (return 0)', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: null, rows: [] } as any);

      const count = await service.purgeOldCases();

      expect(count).toBe(0);
    });
  });
});
