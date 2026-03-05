import { TenantContextService, TenantContext } from '../tenant-context.service';

describe('TenantContextService', () => {
  let service: TenantContextService;

  beforeEach(() => {
    service = new TenantContextService();
  });

  describe('run / getContext', () => {
    it('should make context available inside run callback', () => {
      const ctx: TenantContext = {
        merchantId: 'merchant-abc',
        userId: 'user-123',
        role: 'merchant',
      };

      service.run(ctx, () => {
        expect(service.getContext()).toEqual(ctx);
      });
    });

    it('should return undefined outside of run callback', () => {
      expect(service.getContext()).toBeUndefined();
    });

    it('should isolate context between concurrent runs', async () => {
      const ctx1: TenantContext = { merchantId: 'merchant-1', userId: 'u1', role: 'merchant' };
      const ctx2: TenantContext = { merchantId: 'merchant-2', userId: 'u2', role: 'admin' };

      const results: string[] = [];

      await Promise.all([
        new Promise<void>((resolve) =>
          service.run(ctx1, async () => {
            await new Promise((r) => setTimeout(r, 10));
            results.push(service.getMerchantId()!);
            resolve();
          }),
        ),
        new Promise<void>((resolve) =>
          service.run(ctx2, async () => {
            await new Promise((r) => setTimeout(r, 5));
            results.push(service.getMerchantId()!);
            resolve();
          }),
        ),
      ]);

      // Both contexts should have been isolated — order may vary but values must match
      expect(results).toContain('merchant-1');
      expect(results).toContain('merchant-2');
    });
  });

  describe('getMerchantId', () => {
    it('should return merchantId from active context', () => {
      service.run({ merchantId: 'merch-xyz', userId: 'u1', role: 'merchant' }, () => {
        expect(service.getMerchantId()).toBe('merch-xyz');
      });
    });

    it('should return undefined when no context is active', () => {
      expect(service.getMerchantId()).toBeUndefined();
    });
  });

  describe('getUserId', () => {
    it('should return userId from active context', () => {
      service.run({ merchantId: 'm1', userId: 'user-999', role: 'merchant' }, () => {
        expect(service.getUserId()).toBe('user-999');
      });
    });

    it('should return undefined when no context is active', () => {
      expect(service.getUserId()).toBeUndefined();
    });
  });

  describe('getRole', () => {
    it('should return role from active context', () => {
      service.run({ merchantId: 'm1', userId: 'u1', role: 'admin' }, () => {
        expect(service.getRole()).toBe('admin');
      });
    });

    it('should return undefined when no context is active', () => {
      expect(service.getRole()).toBeUndefined();
    });
  });

  describe('run return value', () => {
    it('should return the value from the callback', () => {
      const result = service.run(
        { merchantId: 'm1', userId: 'u1', role: 'merchant' },
        () => 42,
      );
      expect(result).toBe(42);
    });
  });
});
