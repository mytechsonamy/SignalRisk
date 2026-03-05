import { Test, TestingModule } from '@nestjs/testing';
import { MsisdnLookupService } from '../msisdn-lookup.service';

describe('MsisdnLookupService', () => {
  let service: MsisdnLookupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MsisdnLookupService],
    }).compile();

    service = module.get<MsisdnLookupService>(MsisdnLookupService);
  });

  // -------------------------------------------------------------------------
  // normalize
  // -------------------------------------------------------------------------

  describe('normalize', () => {
    it('should strip leading + from international format', () => {
      expect(service.normalize('+905421234567')).toBe('905421234567');
    });

    it('should strip leading 00 from international dialing prefix', () => {
      expect(service.normalize('00905421234567')).toBe('905421234567');
    });

    it('should convert local Turkish format (05...) to E.164', () => {
      expect(service.normalize('05421234567')).toBe('905421234567');
    });

    it('should return the same string if already normalized', () => {
      expect(service.normalize('905421234567')).toBe('905421234567');
    });

    it('should return null for empty string', () => {
      expect(service.normalize('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(service.normalize('   ')).toBeNull();
    });

    it('should return null for non-digit characters after stripping prefix', () => {
      expect(service.normalize('+90542ABC4567')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // lookup
  // -------------------------------------------------------------------------

  describe('lookup', () => {
    it('should return Turkcell/TR for +905421234567', () => {
      const result = service.lookup('+905421234567');
      expect(result).not.toBeNull();
      expect(result!.operator).toBe('Turkcell');
      expect(result!.countryCode).toBe('TR');
    });

    it('should return same result for 05421234567 as +905421234567 after normalization', () => {
      const resultIntl = service.lookup('+905421234567');
      const resultLocal = service.lookup('05421234567');
      expect(resultLocal).toEqual(resultIntl);
    });

    it('should return null for US number +17328765432', () => {
      const result = service.lookup('+17328765432');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = service.lookup('');
      expect(result).toBeNull();
    });

    it('should identify Vodafone for 546 prefix', () => {
      const result = service.lookup('+905461234567');
      expect(result).not.toBeNull();
      expect(result!.operator).toBe('Vodafone');
      expect(result!.countryCode).toBe('TR');
    });

    it('should identify Turk Telekom for 551 prefix', () => {
      const result = service.lookup('+905511234567');
      expect(result).not.toBeNull();
      expect(result!.operator).toBe('Turk Telekom');
      expect(result!.countryCode).toBe('TR');
    });

    it('known prepaid prefix (541) should have prepaidProbability of 0.6', () => {
      // 541 has prepaidProbability 0.6 (the highest among subscriber prefixes)
      const resultPrepaid = service.lookup('+905411234567');
      expect(resultPrepaid).not.toBeNull();
      expect(resultPrepaid!.prepaidProbability).toBeGreaterThanOrEqual(0.6);
    });

    it('postpaid-leaning prefix (551) should have prepaidProbability < 0.5', () => {
      const result = service.lookup('+905511234567');
      expect(result!.prepaidProbability).toBeLessThan(0.5);
    });

    it('should return null for unknown Turkish prefix', () => {
      // 580 is not in the prefix table
      const result = service.lookup('+905801234567');
      expect(result).toBeNull();
    });

    it('should handle 00 prefix international format', () => {
      const result = service.lookup('00905421234567');
      expect(result).not.toBeNull();
      expect(result!.operator).toBe('Turkcell');
    });
  });

  // -------------------------------------------------------------------------
  // getCountryCode
  // -------------------------------------------------------------------------

  describe('getCountryCode', () => {
    it('should return TR for a Turkish number', () => {
      expect(service.getCountryCode('+905421234567')).toBe('TR');
    });

    it('should return null for an unknown number', () => {
      expect(service.getCountryCode('+17328765432')).toBeNull();
    });

    it('should return null for an empty string', () => {
      expect(service.getCountryCode('')).toBeNull();
    });
  });
});
