/**
 * Unit tests for BurstService
 *
 * Tests burst detection logic including threshold comparison,
 * dimension triggering, and edge cases.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BurstService } from '../burst.service';
import { VelocityService } from '../../velocity/velocity.service';
import { DecayService } from '../../decay/decay.service';
import { VelocitySignals } from '../../velocity/velocity.types';

describe('BurstService', () => {
  let service: BurstService;
  let velocityService: {
    getVelocitySignals: jest.Mock;
    getBaseline: jest.Mock;
  };

  const baseSignals: VelocitySignals = {
    tx_count_10m: 0,
    tx_count_1h: 0,
    tx_count_24h: 0,
    amount_sum_1h: 0,
    amount_sum_24h: 0,
    unique_devices_24h: 0,
    unique_ips_24h: 0,
    unique_sessions_1h: 0,
    burst_detected: false,
  };

  beforeEach(async () => {
    velocityService = {
      getVelocitySignals: jest.fn().mockResolvedValue({ ...baseSignals }),
      getBaseline: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BurstService,
        { provide: VelocityService, useValue: velocityService },
        {
          provide: DecayService,
          useValue: {
            halfLifeHourly: 3600,
            halfLifeDaily: 43200,
            applyDecay: jest.fn((count: number) => count),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'burst.multiplierThreshold') return 3.0;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<BurstService>(BurstService);
  });

  it('should return no burst when baseline is zero', async () => {
    velocityService.getVelocitySignals.mockResolvedValue({
      ...baseSignals,
      tx_count_1h: 100,
    });
    velocityService.getBaseline.mockResolvedValue(0);

    const result = await service.detectBurst('merchant-1', 'entity-1');

    expect(result.detected).toBe(false);
    expect(result.dimensions).toEqual([]);
    expect(result.multiplier).toBe(0);
  });

  it('should return no burst when below threshold', async () => {
    velocityService.getVelocitySignals.mockResolvedValue({
      ...baseSignals,
      tx_count_1h: 5,
    });
    velocityService.getBaseline.mockResolvedValue(2); // 5/2 = 2.5x (below 3x)

    const result = await service.detectBurst('merchant-1', 'entity-1');

    expect(result.detected).toBe(false);
  });

  it('should detect burst when tx_count_1h exceeds 3x baseline', async () => {
    velocityService.getVelocitySignals.mockResolvedValue({
      ...baseSignals,
      tx_count_1h: 15,
    });
    velocityService.getBaseline.mockResolvedValue(3); // 15/3 = 5x

    const result = await service.detectBurst('merchant-1', 'entity-1');

    expect(result.detected).toBe(true);
    expect(result.dimensions).toContain('tx_count_1h');
    expect(result.multiplier).toBe(5);
  });

  it('should detect burst on tx_count_24h dimension', async () => {
    velocityService.getVelocitySignals.mockResolvedValue({
      ...baseSignals,
      tx_count_24h: 360,
    });
    velocityService.getBaseline.mockResolvedValue(2); // 360 / (2*24) = 7.5x

    const result = await service.detectBurst('merchant-1', 'entity-1');

    expect(result.detected).toBe(true);
    expect(result.dimensions).toContain('tx_count_24h');
  });

  it('should detect burst on unique_sessions_1h dimension', async () => {
    velocityService.getVelocitySignals.mockResolvedValue({
      ...baseSignals,
      unique_sessions_1h: 30,
    });
    velocityService.getBaseline.mockResolvedValue(5); // 30/5 = 6x

    const result = await service.detectBurst('merchant-1', 'entity-1');

    expect(result.detected).toBe(true);
    expect(result.dimensions).toContain('unique_sessions_1h');
    expect(result.multiplier).toBe(6);
  });

  it('should detect multiple dimensions in a single burst', async () => {
    velocityService.getVelocitySignals.mockResolvedValue({
      ...baseSignals,
      tx_count_1h: 30,
      unique_sessions_1h: 30,
    });
    velocityService.getBaseline.mockResolvedValue(5); // both at 6x

    const result = await service.detectBurst('merchant-1', 'entity-1');

    expect(result.detected).toBe(true);
    expect(result.dimensions).toContain('tx_count_1h');
    expect(result.dimensions).toContain('unique_sessions_1h');
  });

  it('should report the highest multiplier across dimensions', async () => {
    velocityService.getVelocitySignals.mockResolvedValue({
      ...baseSignals,
      tx_count_1h: 30,       // 30/5 = 6x
      unique_sessions_1h: 50, // 50/5 = 10x
    });
    velocityService.getBaseline.mockResolvedValue(5);

    const result = await service.detectBurst('merchant-1', 'entity-1');

    expect(result.multiplier).toBe(10);
  });

  it('should return no burst when baseline is negligible (< 0.1)', async () => {
    velocityService.getVelocitySignals.mockResolvedValue({
      ...baseSignals,
      tx_count_1h: 1,
    });
    velocityService.getBaseline.mockResolvedValue(0.05);

    const result = await service.detectBurst('merchant-1', 'entity-1');

    expect(result.detected).toBe(false);
  });

  it('should exactly match the threshold boundary', async () => {
    velocityService.getVelocitySignals.mockResolvedValue({
      ...baseSignals,
      tx_count_1h: 30,
    });
    velocityService.getBaseline.mockResolvedValue(10); // 30/10 = 3.0x exactly

    const result = await service.detectBurst('merchant-1', 'entity-1');

    expect(result.detected).toBe(true);
    expect(result.dimensions).toContain('tx_count_1h');
    expect(result.multiplier).toBe(3);
  });
});
