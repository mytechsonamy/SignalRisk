import { Test, TestingModule } from '@nestjs/testing';
import { GraphIntelService } from '../graph-intel.service';
import { NEO4J_DRIVER } from '../graph-driver.provider';
import { DeviceNode, SessionNode } from '../graph.types';

describe('GraphIntelService', () => {
  let service: GraphIntelService;
  let mockSession: {
    run: jest.Mock;
    close: jest.Mock;
  };
  let mockDriver: {
    session: jest.Mock;
    close: jest.Mock;
  };

  beforeEach(async () => {
    mockSession = {
      run: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockDriver = {
      session: jest.fn().mockReturnValue(mockSession),
      close: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GraphIntelService,
        {
          provide: NEO4J_DRIVER,
          useValue: mockDriver,
        },
      ],
    }).compile();

    service = module.get<GraphIntelService>(GraphIntelService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // upsertDevice
  // ---------------------------------------------------------------------------

  describe('upsertDevice', () => {
    const device: DeviceNode = {
      deviceId: 'device-1',
      merchantId: 'merchant-1',
      fingerprint: 'fp-abc',
      trustScore: 80,
      isEmulator: false,
      firstSeenAt: '2024-01-01T00:00:00.000Z',
    };

    it('should call session.run with the correct Cypher query', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.upsertDevice(device);

      expect(mockDriver.session).toHaveBeenCalledTimes(1);
      expect(mockSession.run).toHaveBeenCalledTimes(1);
      const [query, params] = mockSession.run.mock.calls[0];
      expect(query).toContain('MERGE (d:Device {deviceId: $deviceId})');
      expect(query).toContain('MERGE (m:Merchant {merchantId: $merchantId})');
      expect(query).toContain(':USED_BY');
      expect(params.deviceId).toBe('device-1');
      expect(params.merchantId).toBe('merchant-1');
      expect(params.trustScore).toBe(80);
      expect(params.isEmulator).toBe(false);
    });

    it('should call session.close after run', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.upsertDevice(device);

      expect(mockSession.close).toHaveBeenCalledTimes(1);
    });

    it('should close session even if run throws', async () => {
      mockSession.run.mockRejectedValue(new Error('Neo4j error'));

      await expect(service.upsertDevice(device)).rejects.toThrow('Neo4j error');
      expect(mockSession.close).toHaveBeenCalledTimes(1);
    });

    it('should pass firstSeenAt to the query params', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.upsertDevice(device);

      const params = mockSession.run.mock.calls[0][1];
      expect(params.firstSeenAt).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  // ---------------------------------------------------------------------------
  // linkDeviceToSession
  // ---------------------------------------------------------------------------

  describe('linkDeviceToSession', () => {
    const session: SessionNode = {
      sessionId: 'session-1',
      merchantId: 'merchant-1',
      riskScore: 0.4,
      isBot: false,
    };

    it('should call session.run with USED_IN edge', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.linkDeviceToSession('device-1', 'session-1', session);

      expect(mockSession.run).toHaveBeenCalledTimes(1);
      const [query, params] = mockSession.run.mock.calls[0];
      expect(query).toContain(':USED_IN');
      expect(params.deviceId).toBe('device-1');
      expect(params.sessionId).toBe('session-1');
    });

    it('should close session after run', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.linkDeviceToSession('device-1', 'session-1', session);

      expect(mockSession.close).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // detectDeviceSharing
  // ---------------------------------------------------------------------------

  describe('detectDeviceSharing', () => {
    it('should return SharingResult with isSuspicious=false when sharingCount < 3', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = { merchants: ['m1', 'm2'], sharingCount: 2 };
              return data[key];
            },
          },
        ],
      });

      const result = await service.detectDeviceSharing('device-1');

      expect(result.deviceId).toBe('device-1');
      expect(result.sharedAcrossMerchants).toEqual(['m1', 'm2']);
      expect(result.sharingCount).toBe(2);
      expect(result.isSuspicious).toBe(false);
    });

    it('should return isSuspicious=true when sharingCount >= 3', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = { merchants: ['m1', 'm2', 'm3'], sharingCount: 3 };
              return data[key];
            },
          },
        ],
      });

      const result = await service.detectDeviceSharing('device-1');

      expect(result.isSuspicious).toBe(true);
      expect(result.sharingCount).toBe(3);
    });

    it('should return isSuspicious=true when sharingCount > 3', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = {
                merchants: ['m1', 'm2', 'm3', 'm4', 'm5'],
                sharingCount: 5,
              };
              return data[key];
            },
          },
        ],
      });

      const result = await service.detectDeviceSharing('device-1');

      expect(result.isSuspicious).toBe(true);
      expect(result.sharingCount).toBe(5);
    });

    it('should return empty result when no records', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const result = await service.detectDeviceSharing('unknown-device');

      expect(result).toEqual({
        deviceId: 'unknown-device',
        sharedAcrossMerchants: [],
        sharingCount: 0,
        isSuspicious: false,
      });
    });

    it('should call session.close after run', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.detectDeviceSharing('device-1');

      expect(mockSession.close).toHaveBeenCalledTimes(1);
    });

    it('should use the correct Cypher query with USED_BY pattern', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.detectDeviceSharing('device-1');

      const [query, params] = mockSession.run.mock.calls[0];
      expect(query).toContain('MATCH (d:Device {deviceId: $deviceId})-[:USED_BY]->(m:Merchant)');
      expect(params.deviceId).toBe('device-1');
    });
  });

  // ---------------------------------------------------------------------------
  // detectVelocityRing
  // ---------------------------------------------------------------------------

  describe('detectVelocityRing', () => {
    it('should return riskLevel=LOW when sharedDeviceCount < 2', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const result = await service.detectVelocityRing('merchant-1');

      expect(result.merchantId).toBe('merchant-1');
      expect(result.riskLevel).toBe('LOW');
      expect(result.sharedDeviceCount).toBe(0);
    });

    it('should return riskLevel=MEDIUM when sharedDeviceCount is 2-4', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = {
                ringMembers: ['m2', 'm3'],
                totalShared: 4,
                avgTrustScore: 60,
              };
              return data[key];
            },
          },
        ],
      });

      const result = await service.detectVelocityRing('merchant-1');

      expect(result.riskLevel).toBe('MEDIUM');
      expect(result.sharedDeviceCount).toBe(4);
    });

    it('should return riskLevel=HIGH when sharedDeviceCount >= 5', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = {
                ringMembers: ['m2', 'm3', 'm4'],
                totalShared: 5,
                avgTrustScore: 40,
              };
              return data[key];
            },
          },
        ],
      });

      const result = await service.detectVelocityRing('merchant-1');

      expect(result.riskLevel).toBe('HIGH');
      expect(result.sharedDeviceCount).toBe(5);
    });

    it('should return ring members correctly', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = {
                ringMembers: ['m2', 'm3'],
                totalShared: 3,
                avgTrustScore: 55.5,
              };
              return data[key];
            },
          },
        ],
      });

      const result = await service.detectVelocityRing('merchant-1');

      expect(result.ringMembers).toEqual(['m2', 'm3']);
      expect(result.avgTrustScore).toBe(55.5);
    });

    it('should call session.close after run', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.detectVelocityRing('merchant-1');

      expect(mockSession.close).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getDeviceNeighbors
  // ---------------------------------------------------------------------------

  describe('getDeviceNeighbors', () => {
    it('should return device neighbors correctly', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              const data: Record<string, unknown> = {
                deviceIds: ['device-2', 'device-3'],
                count: 2,
              };
              return data[key];
            },
          },
        ],
      });

      const result = await service.getDeviceNeighbors('device-1');

      expect(result.deviceIds).toEqual(['device-2', 'device-3']);
      expect(result.count).toBe(2);
    });

    it('should return empty result when no records', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const result = await service.getDeviceNeighbors('device-1');

      expect(result).toEqual({ deviceIds: [], count: 0 });
    });

    it('should call session.close after run', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.getDeviceNeighbors('device-1');

      expect(mockSession.close).toHaveBeenCalledTimes(1);
    });
  });
});
