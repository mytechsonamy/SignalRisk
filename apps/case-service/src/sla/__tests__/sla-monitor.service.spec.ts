import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SlaMonitorService } from '../sla-monitor.service';
import { SlaAlertService } from '../sla-alert.service';
import { CaseRepository } from '../../cases/case.repository';
import { Case } from '../../cases/case.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBreachedCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'case-001',
    merchantId: 'merchant-001',
    decisionId: 'req-001',
    entityId: 'entity-001',
    action: 'BLOCK',
    riskScore: 85,
    riskFactors: [],
    status: 'OPEN',
    priority: 'HIGH',
    slaDeadline: new Date(Date.now() - 60_000), // expired 1 minute ago
    slaBreached: false,
    assignedTo: null,
    resolution: null,
    resolutionNotes: null,
    resolvedAt: null,
    createdAt: new Date(Date.now() - 5 * 3_600_000),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCaseRepository = {
  findBreachedCases: jest.fn(),
  markSlaBreached: jest.fn(),
};

const mockSlaAlertService = {
  sendAlert: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue(300_000), // 5 minutes default
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlaMonitorService', () => {
  let service: SlaMonitorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlaMonitorService,
        { provide: CaseRepository, useValue: mockCaseRepository },
        { provide: SlaAlertService, useValue: mockSlaAlertService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SlaMonitorService>(SlaMonitorService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -------------------------------------------------------------------------

  describe('onModuleInit', () => {
    it('should set up a recurring interval on init', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      service.onModuleInit();
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Number),
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear the interval on destroy', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      service.onModuleInit();
      service.onModuleDestroy();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------

  describe('checkBreaches', () => {
    it('should return empty array and send no alerts when no cases are breached', async () => {
      mockCaseRepository.findBreachedCases.mockResolvedValue([]);

      const result = await service.checkBreaches();

      expect(result).toHaveLength(0);
      expect(mockCaseRepository.markSlaBreached).not.toHaveBeenCalled();
      expect(mockSlaAlertService.sendAlert).not.toHaveBeenCalled();
    });

    it('should call markSlaBreached for each breached case', async () => {
      const cases = [
        makeBreachedCase({ id: 'case-001' }),
        makeBreachedCase({ id: 'case-002' }),
      ];
      mockCaseRepository.findBreachedCases.mockResolvedValue(cases);
      mockCaseRepository.markSlaBreached.mockResolvedValue(undefined);
      mockSlaAlertService.sendAlert.mockResolvedValue(undefined);

      await service.checkBreaches();

      expect(mockCaseRepository.markSlaBreached).toHaveBeenCalledTimes(2);
      expect(mockCaseRepository.markSlaBreached).toHaveBeenCalledWith('case-001');
      expect(mockCaseRepository.markSlaBreached).toHaveBeenCalledWith('case-002');
    });

    it('should call sendAlert for each breached case', async () => {
      const cases = [
        makeBreachedCase({ id: 'case-001' }),
        makeBreachedCase({ id: 'case-002' }),
      ];
      mockCaseRepository.findBreachedCases.mockResolvedValue(cases);
      mockCaseRepository.markSlaBreached.mockResolvedValue(undefined);
      mockSlaAlertService.sendAlert.mockResolvedValue(undefined);

      await service.checkBreaches();

      expect(mockSlaAlertService.sendAlert).toHaveBeenCalledTimes(2);
      expect(mockSlaAlertService.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({ caseId: 'case-001' }),
      );
      expect(mockSlaAlertService.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({ caseId: 'case-002' }),
      );
    });

    it('should return array of 2 breach events for 2 breached cases', async () => {
      const cases = [
        makeBreachedCase({ id: 'case-001', merchantId: 'merchant-001', priority: 'HIGH', riskScore: 85 }),
        makeBreachedCase({ id: 'case-002', merchantId: 'merchant-002', priority: 'LOW', riskScore: 45 }),
      ];
      mockCaseRepository.findBreachedCases.mockResolvedValue(cases);
      mockCaseRepository.markSlaBreached.mockResolvedValue(undefined);
      mockSlaAlertService.sendAlert.mockResolvedValue(undefined);

      const result = await service.checkBreaches();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        caseId: 'case-001',
        merchantId: 'merchant-001',
        priority: 'HIGH',
        riskScore: 85,
        outcome: 'BLOCK',
      });
      expect(result[1]).toMatchObject({
        caseId: 'case-002',
        merchantId: 'merchant-002',
        priority: 'LOW',
        riskScore: 45,
      });
    });

    it('should include breachedAt as a Date in the breach event', async () => {
      const cases = [makeBreachedCase({ id: 'case-001' })];
      mockCaseRepository.findBreachedCases.mockResolvedValue(cases);
      mockCaseRepository.markSlaBreached.mockResolvedValue(undefined);
      mockSlaAlertService.sendAlert.mockResolvedValue(undefined);

      const result = await service.checkBreaches();

      expect(result[0].breachedAt).toBeInstanceOf(Date);
    });

    it('should log error and continue when markSlaBreached fails for a case', async () => {
      const cases = [
        makeBreachedCase({ id: 'case-001' }),
        makeBreachedCase({ id: 'case-002' }),
      ];
      mockCaseRepository.findBreachedCases.mockResolvedValue(cases);
      mockCaseRepository.markSlaBreached
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(undefined);
      mockSlaAlertService.sendAlert.mockResolvedValue(undefined);

      // Should not throw
      const result = await service.checkBreaches();

      // Only case-002 should succeed (case-001 failed at markSlaBreached so we skip alert)
      expect(mockSlaAlertService.sendAlert).toHaveBeenCalledTimes(1);
      expect(mockSlaAlertService.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({ caseId: 'case-002' }),
      );
      expect(result).toHaveLength(1);
    });

    it('should log error and continue when sendAlert fails for a case', async () => {
      const cases = [
        makeBreachedCase({ id: 'case-001' }),
        makeBreachedCase({ id: 'case-002' }),
      ];
      mockCaseRepository.findBreachedCases.mockResolvedValue(cases);
      mockCaseRepository.markSlaBreached.mockResolvedValue(undefined);
      mockSlaAlertService.sendAlert
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      // Should not throw
      const result = await service.checkBreaches();

      // Both cases were marked, but alert failed for case-001
      // case-001 breach event is still pushed to results (mark succeeded before alert)
      expect(mockCaseRepository.markSlaBreached).toHaveBeenCalledTimes(2);
      // results should still contain both (alert failure doesn't prevent adding to results)
      expect(result).toHaveLength(2);
    });
  });
});
