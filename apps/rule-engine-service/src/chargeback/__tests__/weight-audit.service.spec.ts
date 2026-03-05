import { WeightAuditService } from '../weight-audit.service';
import { WeightAdjustment } from '../chargeback.types';
import { ConfigService } from '@nestjs/config';

const mockQuery = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockQuery,
  })),
}));

describe('WeightAuditService', () => {
  let service: WeightAuditService;
  let configService: ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService = {
      get: jest.fn().mockReturnValue('postgresql://localhost:5432/signalrisk'),
    } as unknown as ConfigService;
    service = new WeightAuditService(configService);
  });

  describe('logAdjustment', () => {
    it('should call pool.query with correct SQL INSERT', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const adjustment: WeightAdjustment = {
        ruleId: 'rule_001',
        oldWeight: 0.80,
        newWeight: 0.85,
        reason: 'fraud_confirmed',
        caseId: 'case_abc',
        timestamp: new Date('2024-01-15T10:00:00Z'),
      };

      await service.logAdjustment(adjustment);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO rule_weight_audit');
      expect(sql).toContain('rule_id, old_weight, new_weight, reason, case_id, timestamp');
      expect(params).toEqual([
        'rule_001',
        0.80,
        0.85,
        'fraud_confirmed',
        'case_abc',
        new Date('2024-01-15T10:00:00Z'),
      ]);
    });

    it('should call pool.query with correct params for false_positive', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const adjustment: WeightAdjustment = {
        ruleId: 'rule_002',
        oldWeight: 0.50,
        newWeight: 0.47,
        reason: 'false_positive',
        caseId: 'case_def',
        timestamp: new Date('2024-02-20T12:00:00Z'),
      };

      await service.logAdjustment(adjustment);

      const [, params] = mockQuery.mock.calls[0];
      expect(params[3]).toBe('false_positive');
      expect(params[4]).toBe('case_def');
    });
  });

  describe('getAuditLog', () => {
    it('should return parsed WeightAdjustment records from DB', async () => {
      const now = new Date('2024-03-01T09:00:00Z');
      mockQuery.mockResolvedValue({
        rows: [
          {
            rule_id: 'rule_001',
            old_weight: '0.80',
            new_weight: '0.85',
            reason: 'fraud_confirmed',
            case_id: 'case_abc',
            timestamp: now,
          },
          {
            rule_id: 'rule_001',
            old_weight: '0.75',
            new_weight: '0.80',
            reason: 'fraud_confirmed',
            case_id: 'case_xyz',
            timestamp: now,
          },
        ],
      });

      const results = await service.getAuditLog('rule_001');

      expect(results).toHaveLength(2);
      expect(results[0].ruleId).toBe('rule_001');
      expect(results[0].oldWeight).toBe(0.80);
      expect(results[0].newWeight).toBe(0.85);
      expect(results[0].reason).toBe('fraud_confirmed');
      expect(results[0].caseId).toBe('case_abc');
    });

    it('should use correct SQL SELECT with rule_id filter and limit', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.getAuditLog('rule_001', 10);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['rule_001', 10],
      );
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE rule_id = $1');
      expect(sql).toContain('ORDER BY timestamp DESC');
      expect(sql).toContain('LIMIT $2');
    });

    it('should use default limit of 20 when not specified', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.getAuditLog('rule_001');

      const [, params] = mockQuery.mock.calls[0];
      expect(params[1]).toBe(20);
    });

    it('should return empty array when no records found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const results = await service.getAuditLog('rule_nonexistent');
      expect(results).toEqual([]);
    });

    it('should parse timestamp as Date object', async () => {
      const ts = new Date('2024-03-05T08:00:00Z');
      mockQuery.mockResolvedValue({
        rows: [
          {
            rule_id: 'rule_ts',
            old_weight: '0.5',
            new_weight: '0.53',
            reason: 'fraud_confirmed',
            case_id: 'case_ts',
            timestamp: ts,
          },
        ],
      });

      const results = await service.getAuditLog('rule_ts');
      expect(results[0].timestamp).toBeInstanceOf(Date);
    });
  });
});
