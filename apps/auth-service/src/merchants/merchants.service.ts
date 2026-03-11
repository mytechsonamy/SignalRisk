import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Pool } from 'pg';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { PG_POOL } from './constants';

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
export class MerchantsService implements OnModuleInit {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'production') return;

    const seeds = [
      { id: '00000000-0000-0000-0000-000000000001', name: 'Test Merchant', clientId: 'test-merchant-001', clientSecret: 'test-secret-001', apiKeyPrefix: 'sk_test_0000', roles: ['merchant'] },
      { id: '00000000-0000-0000-0000-000000000002', name: 'Test Merchant B', clientId: 'merchant-b', clientSecret: 'secret-b', apiKeyPrefix: 'sk_merch_b', roles: ['merchant'] },
      { id: '00000000-0000-0000-0000-000000000003', name: 'Merchant A', clientId: 'merchant-a', clientSecret: 'secret-a', apiKeyPrefix: 'sk_merch_a', roles: ['merchant'] },
      { id: '00000000-0000-0000-0000-000000000004', name: 'Admin', clientId: 'admin', clientSecret: 'admin-secret', apiKeyPrefix: 'sk_admin_d', roles: ['admin'] },
    ];

    let seeded = 0;
    for (const s of seeds) {
      const hash = await bcrypt.hash(s.clientSecret, BCRYPT_ROUNDS);
      const result = await this.pool.query(
        `INSERT INTO merchants (id, name, api_key_prefix, client_id, client_secret_hash, roles, status, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', true, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           client_id = EXCLUDED.client_id,
           client_secret_hash = EXCLUDED.client_secret_hash,
           roles = EXCLUDED.roles,
           api_key_prefix = EXCLUDED.api_key_prefix,
           is_active = true,
           updated_at = NOW()`,
        [s.id, s.name, s.apiKeyPrefix, s.clientId, hash, s.roles],
      );
      if ((result.rowCount ?? 0) > 0) seeded++;
    }
    this.logger.log(`Seeded ${seeded} dev merchants (PostgreSQL)`);
  }

  async findByClientId(clientId: string): Promise<Merchant | undefined> {
    const result = await this.pool.query(
      `SELECT id, name, client_id, client_secret_hash, roles, is_active, created_at, updated_at
       FROM merchants
       WHERE client_id = $1 AND deleted_at IS NULL`,
      [clientId],
    );
    if (result.rows.length === 0) return undefined;
    return this.rowToMerchant(result.rows[0]);
  }

  async findById(id: string): Promise<Merchant | undefined> {
    const result = await this.pool.query(
      `SELECT id, name, client_id, client_secret_hash, roles, is_active, created_at, updated_at
       FROM merchants
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (result.rows.length === 0) return undefined;
    return this.rowToMerchant(result.rows[0]);
  }

  findAll(): Omit<Merchant, 'clientSecretHash'>[] {
    // Synchronous fallback for legacy compatibility — return empty.
    // Use findAllAsync() for the DB-backed version.
    return [];
  }

  async findAllAsync(): Promise<Omit<Merchant, 'clientSecretHash'>[]> {
    const result = await this.pool.query(
      `SELECT id, name, client_id, roles, is_active, created_at, updated_at
       FROM merchants
       WHERE deleted_at IS NULL
       ORDER BY created_at`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      clientId: row.client_id || '',
      roles: row.roles || ['merchant'],
      active: row.is_active ?? true,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  async create(name: string, roles: string[] = ['merchant']): Promise<CreateMerchantResult> {
    return tracer.startActiveSpan('merchants.create', async (span) => {
      try {
        const id = crypto.randomUUID();
        const clientId = `sr_${crypto.randomBytes(16).toString('hex')}`;
        const clientSecret = `srs_${crypto.randomBytes(32).toString('hex')}`;
        const clientSecretHash = await bcrypt.hash(clientSecret, BCRYPT_ROUNDS);

        await this.pool.query(
          `INSERT INTO merchants (id, name, api_key_prefix, client_id, client_secret_hash, roles, status, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', true, NOW(), NOW())`,
          [id, name, `sk_${clientId.slice(0, 8)}`, clientId, clientSecretHash, roles],
        );

        span.setAttribute('merchant.id', id);
        span.setStatus({ code: SpanStatusCode.OK });

        const now = new Date();
        return {
          merchant: { id, name, clientId, roles, active: true, createdAt: now, updatedAt: now },
          clientSecret,
        };
      } finally {
        span.end();
      }
    });
  }

  async rotateSecret(id: string): Promise<{ clientSecret: string } | null> {
    return tracer.startActiveSpan('merchants.rotateSecret', async (span) => {
      try {
        const merchant = await this.findById(id);
        if (!merchant) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Not found' });
          return null;
        }

        const clientSecret = `srs_${crypto.randomBytes(32).toString('hex')}`;
        const clientSecretHash = await bcrypt.hash(clientSecret, BCRYPT_ROUNDS);

        await this.pool.query(
          `UPDATE merchants SET client_secret_hash = $1, updated_at = NOW() WHERE id = $2`,
          [clientSecretHash, id],
        );

        span.setAttribute('merchant.id', id);
        span.setStatus({ code: SpanStatusCode.OK });

        return { clientSecret };
      } finally {
        span.end();
      }
    });
  }

  async deactivate(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE merchants SET is_active = false, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async activate(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE merchants SET is_active = true, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private rowToMerchant(row: Record<string, any>): Merchant {
    return {
      id: row.id,
      name: row.name,
      clientId: row.client_id || '',
      clientSecretHash: row.client_secret_hash || '',
      roles: row.roles || ['merchant'],
      active: row.is_active ?? true,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
