import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FlagsClient } from '../flags.client';
import { FlagCheckResult } from '../flags.types';

// Mock the global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock AbortSignal.timeout
const mockAbortSignal = { aborted: false } as AbortSignal;
jest.spyOn(AbortSignal, 'timeout').mockReturnValue(mockAbortSignal);

describe('FlagsClient', () => {
  let client: FlagsClient;
  const baseUrl = 'http://feature-flag-service:3013';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlagsClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(baseUrl),
          },
        },
      ],
    }).compile();

    client = module.get<FlagsClient>(FlagsClient);
  });

  describe('isEnabled', () => {
    it('should return true when fetch returns FlagCheckResult with enabled=true', async () => {
      const checkResult: FlagCheckResult = {
        flagName: 'graph-scoring',
        merchantId: 'merchant-1',
        enabled: true,
        reason: 'full_rollout',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(checkResult),
      });

      const result = await client.isEnabled('graph-scoring', 'merchant-1');

      expect(result).toBe(true);
    });

    it('should return false when fetch returns FlagCheckResult with enabled=false', async () => {
      const checkResult: FlagCheckResult = {
        flagName: 'rule-engine-v2',
        merchantId: 'merchant-1',
        enabled: false,
        reason: 'disabled',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(checkResult),
      });

      const result = await client.isEnabled('rule-engine-v2', 'merchant-1');

      expect(result).toBe(false);
    });

    it('should return false when fetch throws a network error (fail closed)', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await client.isEnabled('graph-scoring', 'merchant-1');

      expect(result).toBe(false);
    });

    it('should return false when fetch returns non-ok status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: jest.fn(),
      });

      const result = await client.isEnabled('graph-scoring', 'merchant-1');

      expect(result).toBe(false);
    });

    it('should construct correct URL with path and query params', async () => {
      const checkResult: FlagCheckResult = {
        flagName: 'my-flag',
        merchantId: 'merch-abc',
        enabled: true,
        reason: 'allowlist',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(checkResult),
      });

      await client.isEnabled('my-flag', 'merch-abc');

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/v1/flags/my-flag/check?merchantId=merch-abc`,
        expect.objectContaining({ signal: mockAbortSignal }),
      );
    });

    it('should URL-encode special characters in flagName and merchantId', async () => {
      const checkResult: FlagCheckResult = {
        flagName: 'flag with spaces',
        merchantId: 'merchant/special&chars',
        enabled: false,
        reason: 'not_found',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(checkResult),
      });

      await client.isEnabled('flag with spaces', 'merchant/special&chars');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain(encodeURIComponent('flag with spaces'));
      expect(calledUrl).toContain(encodeURIComponent('merchant/special&chars'));
    });

    it('should return false when fetch response json parsing throws', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('JSON parse error')),
      });

      const result = await client.isEnabled('graph-scoring', 'merchant-1');

      expect(result).toBe(false);
    });
  });
});
