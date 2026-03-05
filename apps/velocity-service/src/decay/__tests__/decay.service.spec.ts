/**
 * Unit tests for DecayService
 *
 * Tests the exponential decay formula and convenience methods.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DecayService } from '../decay.service';

describe('DecayService', () => {
  let service: DecayService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecayService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'decay.halfLifeHourly') return 3600;
              if (key === 'decay.halfLifeDaily') return 43200;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DecayService>(DecayService);
  });

  describe('applyDecay', () => {
    it('should return the original count when no time has elapsed', () => {
      const now = Math.floor(Date.now() / 1000);
      const result = service.applyDecay(100, now, 3600);

      expect(result).toBe(100);
    });

    it('should halve the count after one half-life', () => {
      const halfLife = 3600; // 1 hour
      const now = Math.floor(Date.now() / 1000);
      const oneHalfLifeAgo = now - halfLife;

      const result = service.applyDecay(100, oneHalfLifeAgo, halfLife);

      // After one half-life, should be ~50
      expect(result).toBeCloseTo(50, 0);
    });

    it('should quarter the count after two half-lives', () => {
      const halfLife = 3600;
      const now = Math.floor(Date.now() / 1000);
      const twoHalfLivesAgo = now - halfLife * 2;

      const result = service.applyDecay(100, twoHalfLivesAgo, halfLife);

      // After two half-lives, should be ~25
      expect(result).toBeCloseTo(25, 0);
    });

    it('should return 0 for zero count', () => {
      const now = Math.floor(Date.now() / 1000);
      const result = service.applyDecay(0, now - 1000, 3600);

      expect(result).toBe(0);
    });

    it('should return 0 for negative count', () => {
      const now = Math.floor(Date.now() / 1000);
      const result = service.applyDecay(-5, now, 3600);

      expect(result).toBe(0);
    });

    it('should return 0 for zero half-life', () => {
      const now = Math.floor(Date.now() / 1000);
      const result = service.applyDecay(100, now, 0);

      expect(result).toBe(0);
    });

    it('should return the original count when lastUpdated is in the future', () => {
      const now = Math.floor(Date.now() / 1000);
      const future = now + 3600;

      const result = service.applyDecay(100, future, 3600);

      expect(result).toBe(100);
    });

    it('should approach zero for very large elapsed times', () => {
      const halfLife = 3600;
      const now = Math.floor(Date.now() / 1000);
      const longAgo = now - halfLife * 20; // 20 half-lives

      const result = service.applyDecay(1000, longAgo, halfLife);

      // 1000 * 2^(-20) ~ 0.00095
      expect(result).toBeLessThan(0.01);
    });

    it('should handle fractional half-lives correctly', () => {
      const halfLife = 1800; // 30 minutes
      const now = Math.floor(Date.now() / 1000);
      const halfHalfLifeAgo = now - 900; // 15 minutes = half a half-life

      const result = service.applyDecay(100, halfHalfLifeAgo, halfLife);

      // 100 * 2^(-0.5) = 100 * 0.7071 ~ 70.71
      expect(result).toBeCloseTo(70.71, 0);
    });
  });

  describe('applyHourlyDecay', () => {
    it('should use the hourly half-life (3600s)', () => {
      const now = Math.floor(Date.now() / 1000);
      const oneHourAgo = now - 3600;

      const result = service.applyHourlyDecay(100, oneHourAgo);

      expect(result).toBeCloseTo(50, 0);
    });
  });

  describe('applyDailyDecay', () => {
    it('should use the daily half-life (43200s = 12h)', () => {
      const now = Math.floor(Date.now() / 1000);
      const twelveHoursAgo = now - 43200;

      const result = service.applyDailyDecay(100, twelveHoursAgo);

      expect(result).toBeCloseTo(50, 0);
    });
  });

  describe('configuration', () => {
    it('should expose configurable half-life values', () => {
      expect(service.halfLifeHourly).toBe(3600);
      expect(service.halfLifeDaily).toBe(43200);
    });
  });
});
