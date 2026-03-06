import { NotFoundException } from '@nestjs/common';
import { PurgeService } from '../purge.service';
import { Pool } from 'pg';

interface MockClient {
  query: jest.Mock;
  release: jest.Mock;
}

describe('PurgeService', () => {
  let service: PurgeService;
  let mockPool: { connect: jest.Mock };
  let mockClient: MockClient;

  const merchantId = 'merchant-123';

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    service = new PurgeService(mockPool as unknown as Pool);
  });

  describe('purgeMerchant', () => {
    it('should soft-delete the merchant record by setting deleted_at', async () => {
      // Check exists → merchant found
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: merchantId }], rowCount: 1 } as any) // SELECT check
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any) // UPDATE merchants
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // UPDATE api_keys
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any); // INSERT audit_log

      await service.purgeMerchant(merchantId);

      const softDeleteCall = mockClient.query.mock.calls[1];
      expect(softDeleteCall[0]).toContain('deleted_at = NOW()');
      expect(softDeleteCall[1]).toContain(merchantId);
    });

    it('should revoke all API keys for the merchant', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: merchantId }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 2 } as any) // revoke 2 keys
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      await service.purgeMerchant(merchantId);

      const revokeCall = mockClient.query.mock.calls[2];
      expect(revokeCall[0]).toContain('revoked = true');
      expect(revokeCall[1]).toContain(merchantId);
    });

    it('should insert an audit log entry after purge', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: merchantId }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      await service.purgeMerchant(merchantId);

      const auditCall = mockClient.query.mock.calls[3];
      expect(auditCall[0]).toContain('audit_log');
      expect(auditCall[1]).toContain('MERCHANT_PURGE');
    });

    it('should throw NotFoundException if merchant does not exist', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // no merchant found

      await expect(service.purgeMerchant(merchantId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException with correct message', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(service.purgeMerchant(merchantId)).rejects.toThrow(
        `Merchant with id ${merchantId} not found`,
      );
    });

    it('should release the client after a successful purge', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: merchantId }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      await service.purgeMerchant(merchantId);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should release the client even when NotFoundException is thrown', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(service.purgeMerchant(merchantId)).rejects.toThrow(NotFoundException);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should release the client when an unexpected DB error occurs', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: merchantId }], rowCount: 1 } as any)
        .mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(service.purgeMerchant(merchantId)).rejects.toThrow('DB connection lost');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
