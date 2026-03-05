import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { trace, SpanStatusCode } from '@opentelemetry/api';

export interface Merchant {
  id: string;
  name: string;
  clientId: string;
  clientSecretHash: string;
  roles: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMerchantResult {
  merchant: Omit<Merchant, 'clientSecretHash'>;
  clientSecret: string;
}

const tracer = trace.getTracer('auth-service');
const BCRYPT_ROUNDS = 12;

@Injectable()
export class MerchantsService {
  // In-memory store -- replace with database in production
  private merchants: Map<string, Merchant> = new Map();

  findByClientId(clientId: string): Merchant | undefined {
    for (const merchant of this.merchants.values()) {
      if (merchant.clientId === clientId) {
        return merchant;
      }
    }
    return undefined;
  }

  findById(id: string): Merchant | undefined {
    return this.merchants.get(id);
  }

  findAll(): Omit<Merchant, 'clientSecretHash'>[] {
    return Array.from(this.merchants.values()).map(
      ({ clientSecretHash: _, ...rest }) => rest,
    );
  }

  async create(name: string, roles: string[] = ['merchant']): Promise<CreateMerchantResult> {
    return tracer.startActiveSpan('merchants.create', async (span) => {
      try {
        const id = crypto.randomUUID();
        const clientId = `sr_${crypto.randomBytes(16).toString('hex')}`;
        const clientSecret = `srs_${crypto.randomBytes(32).toString('hex')}`;
        const clientSecretHash = await bcrypt.hash(clientSecret, BCRYPT_ROUNDS);

        const now = new Date();
        const merchant: Merchant = {
          id,
          name,
          clientId,
          clientSecretHash,
          roles,
          active: true,
          createdAt: now,
          updatedAt: now,
        };

        this.merchants.set(id, merchant);

        span.setAttribute('merchant.id', id);
        span.setStatus({ code: SpanStatusCode.OK });

        const { clientSecretHash: _, ...safeMerchant } = merchant;
        return { merchant: safeMerchant, clientSecret };
      } finally {
        span.end();
      }
    });
  }

  async rotateSecret(id: string): Promise<{ clientSecret: string } | null> {
    return tracer.startActiveSpan('merchants.rotateSecret', async (span) => {
      try {
        const merchant = this.merchants.get(id);
        if (!merchant) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Not found' });
          return null;
        }

        const clientSecret = `srs_${crypto.randomBytes(32).toString('hex')}`;
        merchant.clientSecretHash = await bcrypt.hash(clientSecret, BCRYPT_ROUNDS);
        merchant.updatedAt = new Date();

        span.setAttribute('merchant.id', id);
        span.setStatus({ code: SpanStatusCode.OK });

        return { clientSecret };
      } finally {
        span.end();
      }
    });
  }

  deactivate(id: string): boolean {
    const merchant = this.merchants.get(id);
    if (!merchant) return false;
    merchant.active = false;
    merchant.updatedAt = new Date();
    return true;
  }

  activate(id: string): boolean {
    const merchant = this.merchants.get(id);
    if (!merchant) return false;
    merchant.active = true;
    merchant.updatedAt = new Date();
    return true;
  }
}
