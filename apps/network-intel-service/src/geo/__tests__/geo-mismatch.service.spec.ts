/**
 * Unit tests for GeoMismatchService
 */

import { GeoMismatchService } from '../geo-mismatch.service';

describe('GeoMismatchService', () => {
  let service: GeoMismatchService;

  beforeEach(() => {
    service = new GeoMismatchService();
  });

  describe('0 mismatches', () => {
    it('should return score 0 when all countries match', () => {
      const result = service.calculateMismatchScore({
        ipCountry: 'TR',
        msisdnCountry: 'TR',
        billingCountry: 'TR',
      });

      expect(result.mismatchCount).toBe(0);
      expect(result.mismatchScore).toBe(0);
      expect(result.details).toHaveLength(0);
    });

    it('should return score 0 when no countries are provided', () => {
      const result = service.calculateMismatchScore({});

      expect(result.mismatchCount).toBe(0);
      expect(result.mismatchScore).toBe(0);
    });

    it('should return score 0 when only ipCountry is provided', () => {
      const result = service.calculateMismatchScore({ ipCountry: 'DE' });

      expect(result.mismatchCount).toBe(0);
      expect(result.mismatchScore).toBe(0);
    });

    it('should not count missing values as a mismatch', () => {
      // msisdnCountry is absent — only 1 pair can be checked (ipCountry vs billingCountry)
      // and both match
      const result = service.calculateMismatchScore({
        ipCountry: 'US',
        billingCountry: 'US',
      });

      expect(result.mismatchCount).toBe(0);
      expect(result.mismatchScore).toBe(0);
    });
  });

  describe('1 mismatch (score = 30)', () => {
    it('should return score 30 when IP vs MSISDN differs', () => {
      const result = service.calculateMismatchScore({
        ipCountry: 'US',
        msisdnCountry: 'TR',
      });

      expect(result.mismatchCount).toBe(1);
      expect(result.mismatchScore).toBe(30);
      expect(result.details).toContain('ip_msisdn_mismatch');
    });

    it('should return score 30 when IP vs billing differs', () => {
      const result = service.calculateMismatchScore({
        ipCountry: 'US',
        billingCountry: 'DE',
      });

      expect(result.mismatchCount).toBe(1);
      expect(result.mismatchScore).toBe(30);
      expect(result.details).toContain('billing_mismatch');
    });

    it('should return score 30 when only one pair mismatches', () => {
      const result = service.calculateMismatchScore({
        ipCountry: 'FR',
        msisdnCountry: 'FR',   // match
        billingCountry: 'GB',  // mismatch
      });

      expect(result.mismatchCount).toBe(1);
      expect(result.mismatchScore).toBe(30);
      expect(result.details).toContain('billing_mismatch');
      expect(result.details).not.toContain('ip_msisdn_mismatch');
    });
  });

  describe('2 mismatches (score = 70)', () => {
    it('should return score 70 when both pairs mismatch', () => {
      const result = service.calculateMismatchScore({
        ipCountry: 'US',
        msisdnCountry: 'TR',
        billingCountry: 'DE',
      });

      expect(result.mismatchCount).toBe(2);
      expect(result.mismatchScore).toBe(70);
      expect(result.details).toContain('ip_msisdn_mismatch');
      expect(result.details).toContain('billing_mismatch');
    });
  });

  describe('case-insensitive comparison', () => {
    it('should treat "tr" and "TR" as the same country', () => {
      const result = service.calculateMismatchScore({
        ipCountry: 'tr',
        msisdnCountry: 'TR',
        billingCountry: 'Tr',
      });

      expect(result.mismatchCount).toBe(0);
      expect(result.mismatchScore).toBe(0);
    });

    it('should detect mismatch with mixed case inputs', () => {
      const result = service.calculateMismatchScore({
        ipCountry: 'us',
        msisdnCountry: 'TR',
      });

      expect(result.mismatchCount).toBe(1);
      expect(result.mismatchScore).toBe(30);
    });
  });

  describe('interface contract', () => {
    it('should always return mismatchCount, mismatchScore, and details', () => {
      const result = service.calculateMismatchScore({
        ipCountry: 'US',
        msisdnCountry: 'DE',
        billingCountry: 'FR',
      });

      expect(result).toHaveProperty('mismatchCount');
      expect(result).toHaveProperty('mismatchScore');
      expect(result).toHaveProperty('details');
      expect(Array.isArray(result.details)).toBe(true);
    });
  });
});
