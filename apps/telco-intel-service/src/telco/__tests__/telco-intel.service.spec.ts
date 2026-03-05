import { Test, TestingModule } from '@nestjs/testing';
import { TelcoIntelService, TelcoAnalysisParams } from '../telco-intel.service';
import { MsisdnLookupService, MsisdnInfo } from '../../msisdn/msisdn-lookup.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMsisdnLookupService = {
  lookup: jest.fn(),
  getCountryCode: jest.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTurkishMsisdnInfo(overrides?: Partial<MsisdnInfo>): MsisdnInfo {
  return {
    operator: 'Turkcell',
    countryCode: 'TR',
    lineType: 'unknown',
    prepaidProbability: 0.5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TelcoIntelService', () => {
  let service: TelcoIntelService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelcoIntelService,
        { provide: MsisdnLookupService, useValue: mockMsisdnLookupService },
      ],
    }).compile();

    service = module.get<TelcoIntelService>(TelcoIntelService);
  });

  // -------------------------------------------------------------------------
  // Basic analysis
  // -------------------------------------------------------------------------

  describe('analyze', () => {
    it('should return TelcoResult with operator and countryCode for known MSISDN', () => {
      mockMsisdnLookupService.lookup.mockReturnValue(
        makeTurkishMsisdnInfo({ operator: 'Turkcell', lineType: 'unknown', prepaidProbability: 0.5 }),
      );

      const params: TelcoAnalysisParams = {
        msisdn: '+905421234567',
        merchantId: 'merchant-001',
      };

      const result = service.analyze(params);

      expect(result.msisdn).toBe('+905421234567');
      expect(result.merchantId).toBe('merchant-001');
      expect(result.operator).toBe('Turkcell');
      expect(result.countryCode).toBe('TR');
      expect(result.isPorted).toBe(false);
    });

    it('should return lineType=unknown and prepaidProbability=0.5 for unknown MSISDN', () => {
      mockMsisdnLookupService.lookup.mockReturnValue(null);

      const params: TelcoAnalysisParams = {
        msisdn: '+17328765432',
        merchantId: 'merchant-001',
      };

      const result = service.analyze(params);

      expect(result.lineType).toBe('unknown');
      expect(result.prepaidProbability).toBe(0.5);
      expect(result.operator).toBeUndefined();
      expect(result.countryCode).toBeUndefined();
    });

    it('should propagate isPorted=true correctly', () => {
      mockMsisdnLookupService.lookup.mockReturnValue(
        makeTurkishMsisdnInfo(),
      );

      const params: TelcoAnalysisParams = {
        msisdn: '+905421234567',
        merchantId: 'merchant-001',
        isPorted: true,
      };

      const result = service.analyze(params);

      expect(result.isPorted).toBe(true);
    });

    it('should preserve portDate as Date object', () => {
      mockMsisdnLookupService.lookup.mockReturnValue(
        makeTurkishMsisdnInfo(),
      );

      const portDate = new Date('2025-06-15T10:00:00Z');
      const params: TelcoAnalysisParams = {
        msisdn: '+905421234567',
        merchantId: 'merchant-001',
        isPorted: true,
        portDate,
      };

      const result = service.analyze(params);

      expect(result.portDate).toBeInstanceOf(Date);
      expect(result.portDate!.getTime()).toBe(portDate.getTime());
    });

    it('should not include portDate in result if not provided', () => {
      mockMsisdnLookupService.lookup.mockReturnValue(
        makeTurkishMsisdnInfo(),
      );

      const params: TelcoAnalysisParams = {
        msisdn: '+905421234567',
        merchantId: 'merchant-001',
      };

      const result = service.analyze(params);

      expect(result.portDate).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Line type resolution priority
  // -------------------------------------------------------------------------

  describe('line type resolution priority', () => {
    it('Payguru lineType overrides prefix heuristic lineType', () => {
      // Prefix heuristic says 'prepaid', but Payguru says 'postpaid'
      mockMsisdnLookupService.lookup.mockReturnValue(
        makeTurkishMsisdnInfo({ lineType: 'prepaid', prepaidProbability: 0.7 }),
      );

      const params: TelcoAnalysisParams = {
        msisdn: '+905421234567',
        merchantId: 'merchant-001',
        payguruLineType: 'postpaid',
      };

      const result = service.analyze(params);

      expect(result.lineType).toBe('postpaid');
    });

    it('Payguru lineType prepaid overrides prefix heuristic', () => {
      // Prefix heuristic says 'postpaid', but Payguru says 'prepaid'
      mockMsisdnLookupService.lookup.mockReturnValue(
        makeTurkishMsisdnInfo({ lineType: 'postpaid', prepaidProbability: 0.35 }),
      );

      const params: TelcoAnalysisParams = {
        msisdn: '+905511234567',
        merchantId: 'merchant-001',
        payguruLineType: 'prepaid',
      };

      const result = service.analyze(params);

      expect(result.lineType).toBe('prepaid');
    });

    it('uses prefix heuristic lineType when no Payguru data', () => {
      mockMsisdnLookupService.lookup.mockReturnValue(
        makeTurkishMsisdnInfo({ lineType: 'prepaid', prepaidProbability: 0.7 }),
      );

      const params: TelcoAnalysisParams = {
        msisdn: '+905421234567',
        merchantId: 'merchant-001',
        // no payguruLineType
      };

      const result = service.analyze(params);

      expect(result.lineType).toBe('prepaid');
    });

    it('falls back to unknown when both Payguru and prefix lookup are absent', () => {
      mockMsisdnLookupService.lookup.mockReturnValue(null);

      const params: TelcoAnalysisParams = {
        msisdn: '+17328765432',
        merchantId: 'merchant-001',
        // no payguruLineType
      };

      const result = service.analyze(params);

      expect(result.lineType).toBe('unknown');
    });

    it('Payguru overrides unknown lineType from prefix lookup', () => {
      mockMsisdnLookupService.lookup.mockReturnValue(
        makeTurkishMsisdnInfo({ lineType: 'unknown', prepaidProbability: 0.5 }),
      );

      const params: TelcoAnalysisParams = {
        msisdn: '+905421234567',
        merchantId: 'merchant-001',
        payguruLineType: 'prepaid',
      };

      const result = service.analyze(params);

      expect(result.lineType).toBe('prepaid');
    });
  });

  // -------------------------------------------------------------------------
  // Default values
  // -------------------------------------------------------------------------

  describe('default values', () => {
    it('isPorted defaults to false when not provided', () => {
      mockMsisdnLookupService.lookup.mockReturnValue(null);

      const params: TelcoAnalysisParams = {
        msisdn: '+905421234567',
        merchantId: 'merchant-001',
      };

      const result = service.analyze(params);

      expect(result.isPorted).toBe(false);
    });

    it('prepaidProbability defaults to 0.5 when MSISDN is unknown', () => {
      mockMsisdnLookupService.lookup.mockReturnValue(null);

      const params: TelcoAnalysisParams = {
        msisdn: '+17328765432',
        merchantId: 'merchant-001',
      };

      const result = service.analyze(params);

      expect(result.prepaidProbability).toBe(0.5);
    });
  });
});
