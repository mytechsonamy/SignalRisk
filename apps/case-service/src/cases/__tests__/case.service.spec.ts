import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CaseService } from '../case.service';
import { CaseRepository } from '../case.repository';
import { DecisionEvent, Case } from '../case.types';
import { BulkActionDto } from '../dto/bulk-action.dto';
import { UpdateCaseDto } from '../dto/update-case.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'case-001',
    merchantId: 'merchant-001',
    decisionId: 'req-001',
    entityId: 'entity-001',
    action: 'BLOCK',
    riskScore: 80,
    riskFactors: [],
    status: 'OPEN',
    priority: 'HIGH',
    slaDeadline: new Date(Date.now() + 4 * 3_600_000),
    assignedTo: null,
    resolution: null,
    resolutionNotes: null,
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDecision(overrides: Partial<DecisionEvent> = {}): DecisionEvent {
  return {
    requestId: 'req-001',
    merchantId: 'merchant-001',
    entityId: 'entity-001',
    action: 'BLOCK',
    riskScore: 80,
    riskFactors: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock repository
// ---------------------------------------------------------------------------

const mockCaseRepository = {
  create: jest.fn(),
  findById: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  bulkUpdate: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CaseService', () => {
  let service: CaseService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseService,
        { provide: CaseRepository, useValue: mockCaseRepository },
      ],
    }).compile();

    service = module.get<CaseService>(CaseService);
  });

  // -------------------------------------------------------------------------
  // createFromDecision
  // -------------------------------------------------------------------------

  describe('createFromDecision', () => {
    it('should create HIGH priority case with 4h SLA for BLOCK action', async () => {
      const decision = makeDecision({ action: 'BLOCK', riskScore: 80 });
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      const expectedCase = makeCase({ priority: 'HIGH' });
      mockCaseRepository.create.mockResolvedValue(expectedCase);

      const result = await service.createFromDecision(decision);

      expect(mockCaseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'merchant-001',
          decisionId: 'req-001',
          entityId: 'entity-001',
          action: 'BLOCK',
          riskScore: 80,
          status: 'OPEN',
          priority: 'HIGH',
          slaDeadline: new Date(now + 4 * 3_600_000),
        }),
      );

      expect(result).toEqual(expectedCase);
      jest.spyOn(Date, 'now').mockRestore();
    });

    it('should create MEDIUM priority case with 24h SLA for REVIEW with score 50-69', async () => {
      const decision = makeDecision({ action: 'REVIEW', riskScore: 55 });
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      const expectedCase = makeCase({
        action: 'REVIEW',
        riskScore: 55,
        priority: 'MEDIUM',
        slaDeadline: new Date(now + 24 * 3_600_000),
      });
      mockCaseRepository.create.mockResolvedValue(expectedCase);

      const result = await service.createFromDecision(decision);

      expect(mockCaseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REVIEW',
          riskScore: 55,
          priority: 'MEDIUM',
          slaDeadline: new Date(now + 24 * 3_600_000),
        }),
      );

      expect(result).toEqual(expectedCase);
      jest.spyOn(Date, 'now').mockRestore();
    });

    it('should create LOW priority case with 24h SLA for REVIEW with score < 50', async () => {
      const decision = makeDecision({ action: 'REVIEW', riskScore: 30 });
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      const expectedCase = makeCase({
        action: 'REVIEW',
        riskScore: 30,
        priority: 'LOW',
        slaDeadline: new Date(now + 24 * 3_600_000),
      });
      mockCaseRepository.create.mockResolvedValue(expectedCase);

      await service.createFromDecision(decision);

      expect(mockCaseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'LOW',
          slaDeadline: new Date(now + 24 * 3_600_000),
        }),
      );

      jest.spyOn(Date, 'now').mockRestore();
    });

    it('should create HIGH priority case for REVIEW with score >= 70', async () => {
      const decision = makeDecision({ action: 'REVIEW', riskScore: 75 });
      mockCaseRepository.create.mockResolvedValue(makeCase({ priority: 'HIGH' }));

      await service.createFromDecision(decision);

      expect(mockCaseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'HIGH' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // listCases
  // -------------------------------------------------------------------------

  describe('listCases', () => {
    it('should pass filters correctly to repository and return pagination metadata', async () => {
      const cases = [makeCase()];
      mockCaseRepository.findMany.mockResolvedValue({ cases, total: 1 });

      const params = {
        merchantId: 'merchant-001',
        status: 'OPEN' as const,
        priority: 'HIGH' as const,
        assignedTo: 'user-001',
        search: 'entity',
        page: 2,
        limit: 10,
      };

      const result = await service.listCases(params);

      expect(mockCaseRepository.findMany).toHaveBeenCalledWith(params);
      expect(result.cases).toEqual(cases);
      expect(result.total).toBe(1);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });

    it('should return empty results when no cases match', async () => {
      mockCaseRepository.findMany.mockResolvedValue({ cases: [], total: 0 });

      const result = await service.listCases({
        merchantId: 'merchant-001',
        page: 1,
        limit: 20,
      });

      expect(result.cases).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // updateCase
  // -------------------------------------------------------------------------

  describe('updateCase', () => {
    it('should record status transition and return updated case', async () => {
      const updated = makeCase({ status: 'IN_REVIEW' });
      mockCaseRepository.update.mockResolvedValue(updated);

      const dto: UpdateCaseDto = { status: 'IN_REVIEW' };
      const result = await service.updateCase('case-001', 'merchant-001', dto);

      expect(mockCaseRepository.update).toHaveBeenCalledWith(
        'case-001',
        'merchant-001',
        expect.objectContaining({ status: 'IN_REVIEW' }),
      );
      expect(result.status).toBe('IN_REVIEW');
    });

    it('should set resolvedAt when resolution is provided', async () => {
      const updated = makeCase({ status: 'RESOLVED', resolution: 'FRAUD' });
      mockCaseRepository.update.mockResolvedValue(updated);

      const dto: UpdateCaseDto = { status: 'RESOLVED', resolution: 'FRAUD' };
      await service.updateCase('case-001', 'merchant-001', dto);

      expect(mockCaseRepository.update).toHaveBeenCalledWith(
        'case-001',
        'merchant-001',
        expect.objectContaining({
          resolution: 'FRAUD',
          resolvedAt: expect.any(Date),
        }),
      );
    });

    it('should throw NotFoundException when case not found', async () => {
      mockCaseRepository.update.mockResolvedValue(null);

      await expect(
        service.updateCase('nonexistent', 'merchant-001', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // bulkAction
  // -------------------------------------------------------------------------

  describe('bulkAction', () => {
    it('should call repository bulkUpdate and return count for RESOLVE', async () => {
      mockCaseRepository.bulkUpdate.mockResolvedValue(3);

      const action: BulkActionDto = {
        ids: ['c1', 'c2', 'c3'],
        action: 'RESOLVE',
      };

      const result = await service.bulkAction(['c1', 'c2', 'c3'], 'merchant-001', action);

      expect(mockCaseRepository.bulkUpdate).toHaveBeenCalledWith(
        ['c1', 'c2', 'c3'],
        'merchant-001',
        expect.objectContaining({ status: 'RESOLVED' }),
      );
      expect(result.updated).toBe(3);
    });

    it('should escalate cases for ESCALATE action', async () => {
      mockCaseRepository.bulkUpdate.mockResolvedValue(2);

      const action: BulkActionDto = { ids: ['c1', 'c2'], action: 'ESCALATE' };
      const result = await service.bulkAction(['c1', 'c2'], 'merchant-001', action);

      expect(mockCaseRepository.bulkUpdate).toHaveBeenCalledWith(
        ['c1', 'c2'],
        'merchant-001',
        expect.objectContaining({ status: 'ESCALATED' }),
      );
      expect(result.updated).toBe(2);
    });

    it('should assign cases for ASSIGN action', async () => {
      mockCaseRepository.bulkUpdate.mockResolvedValue(1);

      const action: BulkActionDto = {
        ids: ['c1'],
        action: 'ASSIGN',
        assignedTo: 'analyst-001',
      };
      await service.bulkAction(['c1'], 'merchant-001', action);

      expect(mockCaseRepository.bulkUpdate).toHaveBeenCalledWith(
        ['c1'],
        'merchant-001',
        expect.objectContaining({
          status: 'IN_REVIEW',
          assignedTo: 'analyst-001',
        }),
      );
    });
  });
});
