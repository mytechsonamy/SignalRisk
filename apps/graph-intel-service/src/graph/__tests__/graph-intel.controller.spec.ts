import { Test, TestingModule } from '@nestjs/testing';
import { GraphIntelController } from '../graph-intel.controller';
import { GraphIntelService } from '../graph-intel.service';
import { SharingResult, VelocityRing } from '../graph.types';

describe('GraphIntelController', () => {
  let controller: GraphIntelController;
  let service: jest.Mocked<GraphIntelService>;

  const mockSharingResult: SharingResult = {
    deviceId: 'device-1',
    sharedAcrossMerchants: ['merchant-1', 'merchant-2'],
    sharingCount: 2,
    isSuspicious: false,
  };

  const mockVelocityRing: VelocityRing = {
    merchantId: 'merchant-1',
    ringMembers: ['merchant-2', 'merchant-3'],
    sharedDeviceCount: 3,
    avgTrustScore: 60,
    riskLevel: 'MEDIUM',
  };

  beforeEach(async () => {
    const mockService = {
      detectDeviceSharing: jest.fn(),
      detectVelocityRing: jest.fn(),
      getDeviceNeighbors: jest.fn(),
      upsertDevice: jest.fn(),
      linkDeviceToSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GraphIntelController],
      providers: [
        {
          provide: GraphIntelService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<GraphIntelController>(GraphIntelController);
    service = module.get(GraphIntelService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // getDeviceSharing
  // ---------------------------------------------------------------------------

  describe('getDeviceSharing', () => {
    it('should call service.detectDeviceSharing with correct deviceId', async () => {
      service.detectDeviceSharing.mockResolvedValue(mockSharingResult);

      await controller.getDeviceSharing('device-1');

      expect(service.detectDeviceSharing).toHaveBeenCalledWith('device-1');
      expect(service.detectDeviceSharing).toHaveBeenCalledTimes(1);
    });

    it('should return service result directly', async () => {
      service.detectDeviceSharing.mockResolvedValue(mockSharingResult);

      const result = await controller.getDeviceSharing('device-1');

      expect(result).toEqual(mockSharingResult);
    });

    it('should forward different deviceId correctly', async () => {
      const otherResult: SharingResult = {
        deviceId: 'device-99',
        sharedAcrossMerchants: [],
        sharingCount: 0,
        isSuspicious: false,
      };
      service.detectDeviceSharing.mockResolvedValue(otherResult);

      const result = await controller.getDeviceSharing('device-99');

      expect(service.detectDeviceSharing).toHaveBeenCalledWith('device-99');
      expect(result.deviceId).toBe('device-99');
    });
  });

  // ---------------------------------------------------------------------------
  // getVelocityRings
  // ---------------------------------------------------------------------------

  describe('getVelocityRings', () => {
    it('should call service.detectVelocityRing with correct merchantId', async () => {
      service.detectVelocityRing.mockResolvedValue(mockVelocityRing);

      await controller.getVelocityRings('merchant-1');

      expect(service.detectVelocityRing).toHaveBeenCalledWith('merchant-1');
      expect(service.detectVelocityRing).toHaveBeenCalledTimes(1);
    });

    it('should return service result directly', async () => {
      service.detectVelocityRing.mockResolvedValue(mockVelocityRing);

      const result = await controller.getVelocityRings('merchant-1');

      expect(result).toEqual(mockVelocityRing);
    });

    it('should forward different merchantId correctly', async () => {
      const highRiskRing: VelocityRing = {
        merchantId: 'merchant-fraud',
        ringMembers: ['m1', 'm2', 'm3', 'm4'],
        sharedDeviceCount: 10,
        avgTrustScore: 20,
        riskLevel: 'HIGH',
      };
      service.detectVelocityRing.mockResolvedValue(highRiskRing);

      const result = await controller.getVelocityRings('merchant-fraud');

      expect(service.detectVelocityRing).toHaveBeenCalledWith('merchant-fraud');
      expect(result.riskLevel).toBe('HIGH');
    });
  });

  // ---------------------------------------------------------------------------
  // getDeviceNeighbors
  // ---------------------------------------------------------------------------

  describe('getDeviceNeighbors', () => {
    it('should call service.getDeviceNeighbors with correct deviceId', async () => {
      service.getDeviceNeighbors.mockResolvedValue({ deviceIds: ['d2', 'd3'], count: 2 });

      await controller.getDeviceNeighbors('device-1');

      expect(service.getDeviceNeighbors).toHaveBeenCalledWith('device-1');
      expect(service.getDeviceNeighbors).toHaveBeenCalledTimes(1);
    });

    it('should return service result directly', async () => {
      const neighborsResult = { deviceIds: ['d2', 'd3'], count: 2 };
      service.getDeviceNeighbors.mockResolvedValue(neighborsResult);

      const result = await controller.getDeviceNeighbors('device-1');

      expect(result).toEqual(neighborsResult);
    });
  });
});
