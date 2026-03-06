import { Test, TestingModule } from '@nestjs/testing';
import { GraphIntelService } from './graph-intel.service';
import { NEO4J_DRIVER } from './graph-driver.provider';
import { GraphIntelInput } from './graph.types';

jest.mock('neo4j-driver');

describe('GraphIntelService - analyze', () => {
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

  function makeRunMock(
    connectedFraudCount: number,
    sharedDeviceCount: number,
    sharedIpCount: number,
  ) {
    let callIndex = 0;
    return jest.fn().mockImplementation(() => {
      callIndex++;
      // First call is the MERGE setup query — returns nothing meaningful
      if (callIndex === 1) {
        return Promise.resolve({ records: [] });
      }
      // Second call: fraudCount query
      if (callIndex === 2) {
        return Promise.resolve({
          records: [
            {
              get: () => connectedFraudCount,
            },
          ],
        });
      }
      // Third call: sharedDevice query
      if (callIndex === 3) {
        return Promise.resolve({
          records: [
            {
              get: () => sharedDeviceCount,
            },
          ],
        });
      }
      // Fourth call: sharedIp query
      if (callIndex === 4) {
        return Promise.resolve({
          records: [
            {
              get: () => sharedIpCount,
            },
          ],
        });
      }
      return Promise.resolve({ records: [] });
    });
  }

  const baseInput: GraphIntelInput = {
    accountId: 'account-1',
    merchantId: 'merchant-1',
    deviceId: 'device-1',
    ipAddress: '192.168.1.1',
  };

  // Test 1: fraud ring detected when connectedFraudCount >= 2 sets fraudRingDetected=true and riskScore+=60
  it('should set fraudRingDetected=true and riskScore+=60 when connectedFraudCount >= 2', async () => {
    mockSession.run = makeRunMock(2, 0, 0);

    const result = await service.analyze(baseInput);

    expect(result.fraudRingDetected).toBe(true);
    expect(result.riskScore).toBe(60);
  });

  // Test 2: sharedDeviceCount >= 3 adds 30 to riskScore
  it('should add 30 to riskScore when sharedDeviceCount >= 3', async () => {
    mockSession.run = makeRunMock(0, 3, 0);

    const result = await service.analyze(baseInput);

    expect(result.sharedDeviceCount).toBe(3);
    expect(result.riskScore).toBe(30);
  });

  // Test 3: riskScore is capped at 100
  it('should cap riskScore at 100 when both signals trigger', async () => {
    mockSession.run = makeRunMock(5, 5, 0);

    const result = await service.analyze(baseInput);

    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(result.riskScore).toBe(100);
  });

  // Test 4: clean account has riskScore=0 and fraudRingDetected=false
  it('should return riskScore=0 and fraudRingDetected=false for clean account', async () => {
    mockSession.run = makeRunMock(0, 0, 0);

    const result = await service.analyze(baseInput);

    expect(result.riskScore).toBe(0);
    expect(result.fraudRingDetected).toBe(false);
  });

  // Test 5: fail-open on Neo4j error
  it('should return fail-open signal (riskScore=0, fraudRingDetected=false) on Neo4j error', async () => {
    mockSession.run.mockRejectedValue(new Error('Neo4j connection error'));

    const result = await service.analyze(baseInput);

    expect(result.riskScore).toBe(0);
    expect(result.fraudRingDetected).toBe(false);
    expect(result.connectedFraudCount).toBe(0);
    expect(result.sharedDeviceCount).toBe(0);
    expect(result.sharedIpCount).toBe(0);
  });

  // Test 6: missing deviceId handled gracefully
  it('should handle missing deviceId without error', async () => {
    const inputWithoutDevice: GraphIntelInput = {
      accountId: 'account-1',
      merchantId: 'merchant-1',
      ipAddress: '192.168.1.1',
    };

    // Only merge + IP queries run (no device queries)
    let callIndex = 0;
    mockSession.run = jest.fn().mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) {
        return Promise.resolve({ records: [] });
      }
      // sharedIp query
      return Promise.resolve({
        records: [{ get: () => 1 }],
      });
    });

    const result = await service.analyze(inputWithoutDevice);

    expect(result).toBeDefined();
    expect(result.sharedDeviceCount).toBe(0);
    expect(result.fraudRingDetected).toBe(false);
  });

  // Test 7: missing ipAddress handled gracefully
  it('should handle missing ipAddress without error', async () => {
    const inputWithoutIp: GraphIntelInput = {
      accountId: 'account-1',
      merchantId: 'merchant-1',
      deviceId: 'device-1',
    };

    mockSession.run = makeRunMock(0, 2, 0);

    const result = await service.analyze(inputWithoutIp);

    expect(result).toBeDefined();
    expect(result.sharedIpCount).toBe(0);
  });

  // Test 8: sharedDeviceCount=2 does NOT trigger +30
  it('should NOT add 30 to riskScore when sharedDeviceCount is exactly 2', async () => {
    mockSession.run = makeRunMock(0, 2, 0);

    const result = await service.analyze(baseInput);

    expect(result.sharedDeviceCount).toBe(2);
    expect(result.riskScore).toBe(0);
  });

  // Test 9: connectedFraudCount=1 does NOT trigger fraudRingDetected
  it('should NOT set fraudRingDetected=true when connectedFraudCount is exactly 1', async () => {
    mockSession.run = makeRunMock(1, 0, 0);

    const result = await service.analyze(baseInput);

    expect(result.connectedFraudCount).toBe(1);
    expect(result.fraudRingDetected).toBe(false);
    expect(result.riskScore).toBe(0);
  });

  // Test 10: combo scoring — both fraud ring and shared device
  it('should combine fraud ring score (60) and shared device score (30) = 90', async () => {
    mockSession.run = makeRunMock(2, 3, 0);

    const result = await service.analyze(baseInput);

    expect(result.fraudRingDetected).toBe(true);
    expect(result.riskScore).toBe(90);
  });

  // Test 11: analyze returns all required fields
  it('should return all required fields in GraphIntelSignal', async () => {
    mockSession.run = makeRunMock(0, 0, 2);

    const result = await service.analyze(baseInput);

    expect(result).toHaveProperty('riskScore');
    expect(result).toHaveProperty('connectedFraudCount');
    expect(result).toHaveProperty('sharedDeviceCount');
    expect(result).toHaveProperty('sharedIpCount');
    expect(result).toHaveProperty('fraudRingDetected');
  });

  // Test 12: session.close is called in finally block
  it('should call session.close in finally block', async () => {
    mockSession.run = makeRunMock(0, 0, 0);

    await service.analyze(baseInput);

    expect(mockSession.close).toHaveBeenCalledTimes(1);
  });

  // Test 13: session.close is called even on error
  it('should call session.close even when Neo4j throws an error', async () => {
    mockSession.run.mockRejectedValue(new Error('Connection refused'));

    await service.analyze(baseInput);

    expect(mockSession.close).toHaveBeenCalledTimes(1);
  });

  // Test 14: both signals combined cap at 100
  it('should cap riskScore at 100 even when signals would exceed 100', async () => {
    // connectedFraudCount=10 (60 pts) + sharedDeviceCount=10 (30 pts) = 90, capped at 100
    mockSession.run = makeRunMock(10, 10, 5);

    const result = await service.analyze(baseInput);

    expect(result.riskScore).toBe(100);
    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(result.fraudRingDetected).toBe(true);
  });
});
