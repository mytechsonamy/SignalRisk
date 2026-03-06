import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { FlagsService } from '../flags.service';
import { FlagsRepository } from '../flags.repository';
import { FeatureFlag, CreateFlagDto } from '../flags.types';

describe('FlagsService', () => {
  let service: FlagsService;
  let repo: FlagsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlagsService,
        FlagsRepository,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('http://localhost:3013'),
          },
        },
      ],
    }).compile();

    service = module.get<FlagsService>(FlagsService);
    repo = module.get<FlagsRepository>(FlagsRepository);
  });

  describe('isEnabled', () => {
    it('should return disabled with reason not_found when flag does not exist', () => {
      const result = service.isEnabled('nonexistent-flag', 'merchant-1');
      expect(result).toEqual({
        flagName: 'nonexistent-flag',
        merchantId: 'merchant-1',
        enabled: false,
        reason: 'not_found',
      });
    });

    it('should return disabled with reason disabled when flag.enabled=false', () => {
      const result = service.isEnabled('rule-engine-v2', 'merchant-1');
      expect(result).toEqual({
        flagName: 'rule-engine-v2',
        merchantId: 'merchant-1',
        enabled: false,
        reason: 'disabled',
      });
    });

    it('should return enabled with reason allowlist when merchantId is in allowlist', () => {
      repo.update('graph-scoring', { merchantIds: ['merchant-allowlisted'] });
      const result = service.isEnabled('graph-scoring', 'merchant-allowlisted');
      expect(result).toEqual({
        flagName: 'graph-scoring',
        merchantId: 'merchant-allowlisted',
        enabled: true,
        reason: 'allowlist',
      });
    });

    it('should return enabled with reason full_rollout when rolloutPercentage=100', () => {
      const result = service.isEnabled('burst-detection-v2', 'any-merchant');
      expect(result).toEqual({
        flagName: 'burst-detection-v2',
        merchantId: 'any-merchant',
        enabled: true,
        reason: 'full_rollout',
      });
    });

    it('should return disabled with reason rollout when rolloutPercentage=0 and not in allowlist', () => {
      const result = service.isEnabled('graph-scoring', 'merchant-1');
      expect(result).toEqual({
        flagName: 'graph-scoring',
        merchantId: 'merchant-1',
        enabled: false,
        reason: 'rollout',
      });
    });

    it('should return consistent result for same merchantId with rolloutPercentage=50 (deterministic)', () => {
      repo.create({
        name: 'test-flag-50',
        description: 'Test flag at 50%',
        enabled: true,
        rolloutPercentage: 50,
        merchantIds: [],
      });

      const result1 = service.isEnabled('test-flag-50', 'merchant-stable');
      const result2 = service.isEnabled('test-flag-50', 'merchant-stable');
      const result3 = service.isEnabled('test-flag-50', 'merchant-stable');

      expect(result1.enabled).toBe(result2.enabled);
      expect(result2.enabled).toBe(result3.enabled);
      expect(result1.reason).toBe('rollout');
    });

    it('should split roughly 50/50 for different merchantIds at rolloutPercentage=50', () => {
      repo.create({
        name: 'test-flag-split',
        description: 'Test flag for split testing',
        enabled: true,
        rolloutPercentage: 50,
        merchantIds: [],
      });

      const total = 1000;
      let enabledCount = 0;
      for (let i = 0; i < total; i++) {
        const result = service.isEnabled('test-flag-split', `merchant-${i}`);
        if (result.enabled) enabledCount++;
      }

      const percentage = (enabledCount / total) * 100;
      // Expect between 40% and 60%
      expect(percentage).toBeGreaterThanOrEqual(40);
      expect(percentage).toBeLessThanOrEqual(60);
    });

    it('should check allowlist before rolloutPercentage=100', () => {
      repo.update('burst-detection-v2', { merchantIds: ['special-merchant'] });
      const result = service.isEnabled('burst-detection-v2', 'special-merchant');
      // allowlist takes priority, so reason should be 'allowlist' not 'full_rollout'
      expect(result.reason).toBe('allowlist');
      expect(result.enabled).toBe(true);
    });

    it('should handle exact rolloutPercentage boundary at 100', () => {
      repo.create({
        name: 'exact-100',
        description: 'Exactly 100% rollout',
        enabled: true,
        rolloutPercentage: 100,
        merchantIds: [],
      });
      const result = service.isEnabled('exact-100', 'any-merchant');
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('full_rollout');
    });

    it('should handle exact rolloutPercentage boundary at 0', () => {
      repo.create({
        name: 'exact-0',
        description: 'Exactly 0% rollout',
        enabled: true,
        rolloutPercentage: 0,
        merchantIds: [],
      });
      const result = service.isEnabled('exact-0', 'any-merchant');
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('rollout');
    });
  });

  describe('deterministicHash', () => {
    it('should return the same hash for the same input', () => {
      const input = 'merchant-123:my-flag';
      const hash1 = service.deterministicHash(input);
      const hash2 = service.deterministicHash(input);
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different inputs', () => {
      const hash1 = service.deterministicHash('merchant-a:flag');
      const hash2 = service.deterministicHash('merchant-b:flag');
      expect(hash1).not.toBe(hash2);
    });

    it('should return a non-negative number', () => {
      const hash = service.deterministicHash('test:input');
      expect(hash).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAll', () => {
    it('should return all pre-seeded flags', () => {
      const flags = service.getAll();
      expect(flags.length).toBeGreaterThanOrEqual(3);
      const names = flags.map((f) => f.name);
      expect(names).toContain('rule-engine-v2');
      expect(names).toContain('graph-scoring');
      expect(names).toContain('burst-detection-v2');
    });

    it('should include newly created flags', () => {
      repo.create({
        name: 'new-flag',
        description: 'A new flag',
        enabled: true,
        rolloutPercentage: 50,
        merchantIds: [],
      });
      const flags = service.getAll();
      const names = flags.map((f) => f.name);
      expect(names).toContain('new-flag');
    });
  });

  describe('createFlag', () => {
    it('should store flag with generated UUID and timestamps', () => {
      const dto: CreateFlagDto = {
        name: 'my-new-flag',
        description: 'A test flag',
        enabled: true,
        rolloutPercentage: 25,
        merchantIds: ['m-1', 'm-2'],
      };

      const flag = service.createFlag(dto);

      expect(flag.id).toBeDefined();
      expect(flag.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(flag.createdAt).toBeInstanceOf(Date);
      expect(flag.updatedAt).toBeInstanceOf(Date);
      expect(flag.name).toBe('my-new-flag');
      expect(flag.rolloutPercentage).toBe(25);
      expect(flag.merchantIds).toEqual(['m-1', 'm-2']);
    });
  });

  describe('updateFlag', () => {
    it('should update specific fields and preserve others', () => {
      const original = repo.findByName('graph-scoring')!;
      const updated = service.updateFlag('graph-scoring', {
        description: 'Updated description',
        rolloutPercentage: 75,
      });

      expect(updated.description).toBe('Updated description');
      expect(updated.rolloutPercentage).toBe(75);
      expect(updated.name).toBe(original.name);
      expect(updated.id).toBe(original.id);
      expect(updated.createdAt).toEqual(original.createdAt);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        original.updatedAt.getTime(),
      );
    });

    it('should throw NotFoundException for non-existent flag', () => {
      expect(() => service.updateFlag('does-not-exist', { enabled: true })).toThrow(
        NotFoundException,
      );
    });
  });

  describe('getFlag', () => {
    it('should return flag by name', () => {
      const flag = service.getFlag('graph-scoring');
      expect(flag.name).toBe('graph-scoring');
    });

    it('should throw NotFoundException for non-existent flag', () => {
      expect(() => service.getFlag('does-not-exist')).toThrow(NotFoundException);
    });
  });

  describe('deleteFlag', () => {
    it('should throw NotFoundException for non-existent flag', () => {
      expect(() => service.deleteFlag('does-not-exist')).toThrow(NotFoundException);
    });

    it('should delete existing flag', () => {
      repo.create({
        name: 'to-delete',
        description: 'Will be deleted',
        enabled: false,
        rolloutPercentage: 0,
        merchantIds: [],
      });
      expect(() => service.deleteFlag('to-delete')).not.toThrow();
      expect(repo.findByName('to-delete')).toBeUndefined();
    });
  });
});
