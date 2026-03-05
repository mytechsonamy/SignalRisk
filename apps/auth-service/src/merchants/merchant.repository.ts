import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import * as bcryptjs from 'bcryptjs';
import * as crypto from 'crypto';
import { Merchant } from './merchant.entity';

const BCRYPT_ROUNDS = 10;

export interface CreateMerchantData {
  name: string;
  webhookUrl?: string;
  rateLimitPerMinute?: number;
  tier?: 'default' | 'burst';
}

export interface UpdateMerchantData {
  name?: string;
  webhookUrl?: string;
  rateLimitPerMinute?: number;
  tier?: 'default' | 'burst';
  isActive?: boolean;
}

export interface RotateApiKeyResult {
  apiKey: string;
  apiKeyHash: string;
  apiKeyPrefix: string;
}

function rowToMerchant(row: Record<string, any>): Merchant {
  return {
    id: row.id,
    name: row.name,
    apiKeyHash: row.api_key_hash,
    apiKeyPrefix: row.api_key_prefix,
    webhookUrl: row.webhook_url ?? undefined,
    rateLimitPerMinute: row.rate_limit_per_minute,
    tier: row.tier,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}

@Injectable()
export class MerchantRepository {
  constructor(private readonly pool: Pool) {}

  async create(data: CreateMerchantData, rawApiKey: string): Promise<Merchant> {
    const id = crypto.randomUUID();
    const apiKeyHash = await bcryptjs.hash(rawApiKey, BCRYPT_ROUNDS);
    // The prefix is the first 8 chars of the full key (including prefix "sk_test_")
    const apiKeyPrefix = rawApiKey.substring(0, 8);

    const result = await this.pool.query(
      `INSERT INTO merchants
         (id, name, api_key_hash, api_key_prefix, webhook_url, rate_limit_per_minute, tier, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        id,
        data.name,
        apiKeyHash,
        apiKeyPrefix,
        data.webhookUrl ?? null,
        data.rateLimitPerMinute ?? 1000,
        data.tier ?? 'default',
        true,
      ],
    );

    return rowToMerchant(result.rows[0]);
  }

  async findById(id: string): Promise<Merchant | null> {
    const result = await this.pool.query(
      `SELECT * FROM merchants WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return rowToMerchant(result.rows[0]);
  }

  async findByApiKeyPrefix(prefix: string): Promise<Merchant | null> {
    const result = await this.pool.query(
      `SELECT * FROM merchants WHERE api_key_prefix = $1 AND deleted_at IS NULL`,
      [prefix],
    );
    if (result.rows.length === 0) return null;
    return rowToMerchant(result.rows[0]);
  }

  async update(id: string, data: UpdateMerchantData): Promise<Merchant | null> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIdx = 1;

    if (data.name !== undefined) {
      setClauses.push(`name = $${paramIdx++}`);
      values.push(data.name);
    }
    if (data.webhookUrl !== undefined) {
      setClauses.push(`webhook_url = $${paramIdx++}`);
      values.push(data.webhookUrl);
    }
    if (data.rateLimitPerMinute !== undefined) {
      setClauses.push(`rate_limit_per_minute = $${paramIdx++}`);
      values.push(data.rateLimitPerMinute);
    }
    if (data.tier !== undefined) {
      setClauses.push(`tier = $${paramIdx++}`);
      values.push(data.tier);
    }
    if (data.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIdx++}`);
      values.push(data.isActive);
    }

    values.push(id);
    const result = await this.pool.query(
      `UPDATE merchants SET ${setClauses.join(', ')} WHERE id = $${paramIdx} AND deleted_at IS NULL RETURNING *`,
      values,
    );
    if (result.rows.length === 0) return null;
    return rowToMerchant(result.rows[0]);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE merchants SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async rotateApiKey(id: string, rawApiKey: string): Promise<Merchant | null> {
    const apiKeyHash = await bcryptjs.hash(rawApiKey, BCRYPT_ROUNDS);
    const apiKeyPrefix = rawApiKey.substring(0, 8);

    const result = await this.pool.query(
      `UPDATE merchants
       SET api_key_hash = $1, api_key_prefix = $2, updated_at = NOW()
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [apiKeyHash, apiKeyPrefix, id],
    );
    if (result.rows.length === 0) return null;
    return rowToMerchant(result.rows[0]);
  }
}
