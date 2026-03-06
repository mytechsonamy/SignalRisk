import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FlagsController } from '../flags.controller';
import { FlagsService } from '../flags.service';
import { FeatureFlag, FlagCheckResult, CreateFlagDto, UpdateFlagDto } from '../flags.types';

const mockFlag: FeatureFlag = {
  id: 'uuid-1',
  name: 'graph-scoring',
  description: 'Graph-based fraud scoring',
  enabled: true,
  rolloutPercentage: 50,
  merchantIds: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockFlagsService = {
  getAll: jest.fn(),
  getFlag: jest.fn(),
  isEnabled: jest.fn(),
  createFlag: jest.fn(),
  updateFlag: jest.fn(),
  deleteFlag: jest.fn(),
};

describe('FlagsController', () => {
  let controller: FlagsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FlagsController],
      providers: [
        {
          provide: FlagsService,
          useValue: mockFlagsService,
        },
      ],
    }).compile();

    controller = module.get<FlagsController>(FlagsController);
  });

  describe('GET /v1/flags', () => {
    it('should return all flags', () => {
      const flags = [mockFlag];
      mockFlagsService.getAll.mockReturnValue(flags);

      const result = controller.listFlags();

      expect(result).toEqual(flags);
      expect(mockFlagsService.getAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no flags exist', () => {
      mockFlagsService.getAll.mockReturnValue([]);

      const result = controller.listFlags();

      expect(result).toEqual([]);
    });
  });

  describe('GET /v1/flags/:name', () => {
    it('should return specific flag by name', () => {
      mockFlagsService.getFlag.mockReturnValue(mockFlag);

      const result = controller.getFlag('graph-scoring');

      expect(result).toEqual(mockFlag);
      expect(mockFlagsService.getFlag).toHaveBeenCalledWith('graph-scoring');
    });

    it('should throw 404 if flag not found', () => {
      mockFlagsService.getFlag.mockImplementation(() => {
        throw new NotFoundException("Feature flag 'nonexistent' not found");
      });

      expect(() => controller.getFlag('nonexistent')).toThrow(NotFoundException);
    });
  });

  describe('GET /v1/flags/:name/check', () => {
    it('should return FlagCheckResult for a given merchantId', () => {
      const checkResult: FlagCheckResult = {
        flagName: 'graph-scoring',
        merchantId: 'merchant-123',
        enabled: true,
        reason: 'full_rollout',
      };
      mockFlagsService.isEnabled.mockReturnValue(checkResult);

      const result = controller.checkFlag('graph-scoring', 'merchant-123');

      expect(result).toEqual(checkResult);
      expect(mockFlagsService.isEnabled).toHaveBeenCalledWith(
        'graph-scoring',
        'merchant-123',
      );
    });

    it('should return disabled result for unknown flag', () => {
      const checkResult: FlagCheckResult = {
        flagName: 'unknown-flag',
        merchantId: 'merchant-123',
        enabled: false,
        reason: 'not_found',
      };
      mockFlagsService.isEnabled.mockReturnValue(checkResult);

      const result = controller.checkFlag('unknown-flag', 'merchant-123');

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('not_found');
    });
  });

  describe('POST /v1/flags', () => {
    it('should create and return a new flag', () => {
      const dto: CreateFlagDto = {
        name: 'new-flag',
        description: 'A new feature flag',
        enabled: true,
        rolloutPercentage: 25,
        merchantIds: [],
      };
      const createdFlag: FeatureFlag = {
        ...mockFlag,
        ...dto,
        id: 'new-uuid',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockFlagsService.createFlag.mockReturnValue(createdFlag);

      const result = controller.createFlag(dto);

      expect(result).toEqual(createdFlag);
      expect(mockFlagsService.createFlag).toHaveBeenCalledWith(dto);
    });
  });

  describe('PATCH /v1/flags/:name', () => {
    it('should update and return the modified flag', () => {
      const dto: UpdateFlagDto = { enabled: false, rolloutPercentage: 10 };
      const updatedFlag = { ...mockFlag, ...dto };
      mockFlagsService.updateFlag.mockReturnValue(updatedFlag);

      const result = controller.updateFlag('graph-scoring', dto);

      expect(result).toEqual(updatedFlag);
      expect(mockFlagsService.updateFlag).toHaveBeenCalledWith('graph-scoring', dto);
    });

    it('should throw 404 when updating non-existent flag', () => {
      mockFlagsService.updateFlag.mockImplementation(() => {
        throw new NotFoundException("Feature flag 'nonexistent' not found");
      });

      expect(() =>
        controller.updateFlag('nonexistent', { enabled: false }),
      ).toThrow(NotFoundException);
    });
  });

  describe('DELETE /v1/flags/:name', () => {
    it('should call deleteFlag and return void (204)', () => {
      mockFlagsService.deleteFlag.mockReturnValue(undefined);

      const result = controller.deleteFlag('graph-scoring');

      expect(result).toBeUndefined();
      expect(mockFlagsService.deleteFlag).toHaveBeenCalledWith('graph-scoring');
    });

    it('should throw 404 when deleting non-existent flag', () => {
      mockFlagsService.deleteFlag.mockImplementation(() => {
        throw new NotFoundException("Feature flag 'nonexistent' not found");
      });

      expect(() => controller.deleteFlag('nonexistent')).toThrow(NotFoundException);
    });
  });
});
