import { DeviceRetentionService } from '../device-retention.service';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

interface MockClient {
  query: jest.Mock;
  release: jest.Mock;
}

describe('DeviceRetentionService', () => {
  let service: DeviceRetentionService;
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
          DEVICES_RETENTION_DAYS: 730,
          PURGE_BATCH_SIZE: 500,
        };
        return config[key] ?? defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new DeviceRetentionService(mockPool as unknown as Pool, mockConfigService);
  });

  describe('runRetentionJob', () => {
    it('should delete devices not seen for more than the retention period', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 8, rows: [] } as any);

      const result = await service.runRetentionJob();

      expect(result.purgedDevices).toBe(8);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('last_seen_at'),
        expect.any(Array),
      );
    });

    it('should return zero purged when no devices qualify', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] } as any);

      const result = await service.runRetentionJob();

      expect(result.purgedDevices).toBe(0);
    });

    it('should always release the pool client after the job', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 2, rows: [] } as any);

      await service.runRetentionJob();

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('purgeOldDevices', () => {
    it('should use the configured batch size as LIMIT', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] } as any);

      await service.purgeOldDevices();

      const callArgs = mockClient.query.mock.calls[0];
      expect(callArgs[1]).toContain(500); // default batch size
    });

    it('should use configured retention days (730) in the query', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] } as any);

      await service.purgeOldDevices();

      const deleteCall = mockClient.query.mock.calls[0];
      expect(deleteCall[0]).toContain('730 days');
    });

    it('should add merchant_id condition when merchantId is provided', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 3, rows: [] } as any);

      await service.purgeOldDevices('merchant-xyz');

      const deleteCall = mockClient.query.mock.calls[0];
      expect(deleteCall[0]).toContain('merchant_id');
      expect(deleteCall[1]).toContain('merchant-xyz');
    });

    it('should NOT add merchant_id condition when no merchantId is provided', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] } as any);

      await service.purgeOldDevices();

      const deleteCall = mockClient.query.mock.calls[0];
      expect(deleteCall[1]).toEqual([500]);
    });

    it('should release the client even when the query throws', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(service.purgeOldDevices()).rejects.toThrow('Connection failed');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should handle null rowCount gracefully and return 0', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: null, rows: [] } as any);

      const count = await service.purgeOldDevices();

      expect(count).toBe(0);
    });
  });
});
