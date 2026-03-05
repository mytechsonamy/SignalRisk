import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  merchantId: string;
  userId: string;
  role: string;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  /**
   * Run a function within a tenant context.
   * All async operations within fn() can access the context via getContext().
   */
  run<T>(context: TenantContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  /**
   * Get the current tenant context from AsyncLocalStorage.
   * Returns undefined if called outside of a tenant context.
   */
  getContext(): TenantContext | undefined {
    return this.storage.getStore();
  }

  /**
   * Get the current merchant ID from AsyncLocalStorage.
   * Returns undefined if called outside of a tenant context.
   */
  getMerchantId(): string | undefined {
    return this.storage.getStore()?.merchantId;
  }

  /**
   * Get the current user ID from AsyncLocalStorage.
   * Returns undefined if called outside of a tenant context.
   */
  getUserId(): string | undefined {
    return this.storage.getStore()?.userId;
  }

  /**
   * Get the current user role from AsyncLocalStorage.
   * Returns undefined if called outside of a tenant context.
   */
  getRole(): string | undefined {
    return this.storage.getStore()?.role;
  }
}
