import { NotFoundException } from '@nestjs/common';
import { MerchantService } from '../merchant.service';
import { MerchantRepository } from '../merchant.repository';
import { Merchant } from '../merchant.entity';

const makeBaseMerchant = (overrides: Partial<Merchant> = {}): Merchant => ({
  id: 'uuid-1234',
  name: 'Test Merchant',
  apiKeyHash: '$2a$10$hashedvalue',
  apiKeyPrefix: 'sk_test_',
  webhookUrl: undefined,
  rateLimitPerMinute: 1000,
  tier: 'default',
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  deletedAt: undefined,
  ...overrides,
});

describe('MerchantService', () => {
  let service: MerchantService;
  let repo: jest.Mocked<MerchantRepository>;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByApiKeyPrefix: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      rotateApiKey: jest.fn(),
    } as unknown as jest.Mocked<MerchantRepository>;

    service = new MerchantService(repo);
  });

  // ---- createMerchant -------------------------------------------------------

  describe('createMerchant', () => {
    it('should call repo.create and return the merchant with apiKey', async () => {
      const base = makeBaseMerchant();
      repo.create.mockResolvedValue(base);

      const result = await service.createMerchant({ name: 'Test Merchant' });

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(result.apiKey).toBeDefined();
    });

    it('should generate apiKey with sk_test_ prefix', async () => {
      repo.create.mockResolvedValue(makeBaseMerchant());

      const result = await service.createMerchant({ name: 'Test' });

      expect(result.apiKey).toMatch(/^sk_test_[0-9a-f]{32}$/);
    });

    it('should NOT include apiKeyHash in the result', async () => {
      repo.create.mockResolvedValue(makeBaseMerchant());

      const result = await service.createMerchant({ name: 'Test' });

      expect((result as any).apiKeyHash).toBeUndefined();
    });

    it('should pass webhookUrl and tier to repo', async () => {
      repo.create.mockResolvedValue(
        makeBaseMerchant({ tier: 'burst', webhookUrl: 'https://example.com' }),
      );

      await service.createMerchant({
        name: 'Test',
        webhookUrl: 'https://example.com',
        tier: 'burst',
      });

      const callArgs = repo.create.mock.calls[0][0];
      expect(callArgs.webhookUrl).toBe('https://example.com');
      expect(callArgs.tier).toBe('burst');
    });

    it('should pass the generated API key (raw) to repo.create', async () => {
      repo.create.mockResolvedValue(makeBaseMerchant());

      const result = await service.createMerchant({ name: 'Test' });
      const passedKey = repo.create.mock.calls[0][1] as string;

      // The raw key passed to repo should match what was returned
      expect(passedKey).toBe(result.apiKey);
    });

    it('should generate a different API key each call', async () => {
      repo.create.mockResolvedValue(makeBaseMerchant());

      const r1 = await service.createMerchant({ name: 'A' });
      const r2 = await service.createMerchant({ name: 'B' });

      expect(r1.apiKey).not.toBe(r2.apiKey);
    });
  });

  // ---- getMerchant ----------------------------------------------------------

  describe('getMerchant', () => {
    it('should return a merchant by id', async () => {
      repo.findById.mockResolvedValue(makeBaseMerchant());

      const result = await service.getMerchant('uuid-1234');

      expect(result.id).toBe('uuid-1234');
      expect(repo.findById).toHaveBeenCalledWith('uuid-1234');
    });

    it('should throw NotFoundException when merchant not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.getMerchant('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not return apiKeyHash', async () => {
      repo.findById.mockResolvedValue(makeBaseMerchant());

      const result = await service.getMerchant('uuid-1234');

      expect((result as any).apiKeyHash).toBeUndefined();
    });
  });

  // ---- updateMerchant -------------------------------------------------------

  describe('updateMerchant', () => {
    it('should return the updated merchant', async () => {
      const updated = makeBaseMerchant({ name: 'New Name' });
      repo.findById.mockResolvedValue(makeBaseMerchant());
      repo.update.mockResolvedValue(updated);

      const result = await service.updateMerchant('uuid-1234', {
        name: 'New Name',
      });

      expect(result.name).toBe('New Name');
    });

    it('should throw NotFoundException when merchant not found on lookup', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.updateMerchant('unknown', { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when repo.update returns null', async () => {
      repo.findById.mockResolvedValue(makeBaseMerchant());
      repo.update.mockResolvedValue(null);

      await expect(
        service.updateMerchant('uuid-1234', { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not include apiKeyHash in result', async () => {
      repo.findById.mockResolvedValue(makeBaseMerchant());
      repo.update.mockResolvedValue(makeBaseMerchant({ name: 'Updated' }));

      const result = await service.updateMerchant('uuid-1234', {
        name: 'Updated',
      });

      expect((result as any).apiKeyHash).toBeUndefined();
    });
  });

  // ---- deleteMerchant -------------------------------------------------------

  describe('deleteMerchant', () => {
    it('should call softDelete for existing merchant', async () => {
      repo.findById.mockResolvedValue(makeBaseMerchant());
      repo.softDelete.mockResolvedValue(true);

      await expect(service.deleteMerchant('uuid-1234')).resolves.toBeUndefined();
      expect(repo.softDelete).toHaveBeenCalledWith('uuid-1234');
    });

    it('should throw NotFoundException for non-existent merchant', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.deleteMerchant('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not call softDelete when merchant not found', async () => {
      repo.findById.mockResolvedValue(null);

      await service.deleteMerchant('unknown').catch(() => {});
      expect(repo.softDelete).not.toHaveBeenCalled();
    });
  });

  // ---- rotateApiKey ---------------------------------------------------------

  describe('rotateApiKey', () => {
    it('should return a new apiKey and prefix', async () => {
      const updatedMerchant = makeBaseMerchant({
        apiKeyPrefix: 'sk_test_',
      });
      repo.findById.mockResolvedValue(makeBaseMerchant());
      repo.rotateApiKey.mockResolvedValue(updatedMerchant);

      const result = await service.rotateApiKey('uuid-1234');

      expect(result.apiKey).toMatch(/^sk_test_[0-9a-f]{32}$/);
      expect(result.prefix).toBe('sk_test_');
    });

    it('should generate a different key than original', async () => {
      const originalMerchant = makeBaseMerchant({
        apiKeyPrefix: 'sk_test_',
      });
      const updatedMerchant = makeBaseMerchant({ apiKeyPrefix: 'sk_test_' });
      repo.findById.mockResolvedValue(originalMerchant);
      repo.rotateApiKey.mockResolvedValue(updatedMerchant);

      const firstResult = await service.rotateApiKey('uuid-1234');
      repo.rotateApiKey.mockResolvedValue(updatedMerchant);
      const secondResult = await service.rotateApiKey('uuid-1234');

      // keys are random, very unlikely to be equal
      expect(firstResult.apiKey).not.toBe(secondResult.apiKey);
    });

    it('should throw NotFoundException when merchant not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.rotateApiKey('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when rotateApiKey returns null', async () => {
      repo.findById.mockResolvedValue(makeBaseMerchant());
      repo.rotateApiKey.mockResolvedValue(null);

      await expect(service.rotateApiKey('uuid-1234')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should call repo.rotateApiKey with the correct id', async () => {
      repo.findById.mockResolvedValue(makeBaseMerchant());
      repo.rotateApiKey.mockResolvedValue(makeBaseMerchant());

      await service.rotateApiKey('uuid-1234');

      expect(repo.rotateApiKey).toHaveBeenCalledWith(
        'uuid-1234',
        expect.stringMatching(/^sk_test_[0-9a-f]{32}$/),
      );
    });
  });
});
