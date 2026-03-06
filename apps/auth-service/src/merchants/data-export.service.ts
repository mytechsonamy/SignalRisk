import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Pool } from 'pg';

export interface MerchantDataExport {
  exportId: string;
  merchantId: string;
  generatedAt: string;
  merchant: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    status: string;
  };
  apiKeys: Array<{
    prefix: string;      // first 8 chars only — never raw key
    createdAt: string;
    lastUsedAt: string | null;
  }>;
  auditLog: Array<{
    action: string;
    timestamp: string;
    ip: string | null;
    details: Record<string, unknown>;
  }>;
  apiKeyUsage: Array<{
    keyPrefix: string;
    endpoint: string;
    timestamp: string;
    ip: string;
  }>;
}

@Injectable()
export class DataExportService {
  constructor(@Inject('DB_POOL') private readonly db: Pool) {}

  async exportMerchantData(merchantId: string): Promise<MerchantDataExport> {
    const client = await this.db.connect();
    try {
      // 1. Get merchant record
      const merchantRes = await client.query(
        'SELECT id, name, email, created_at, status FROM merchants WHERE id = $1 AND deleted_at IS NULL',
        [merchantId],
      );
      if (merchantRes.rows.length === 0) {
        throw new NotFoundException(`Merchant ${merchantId} not found`);
      }
      const merchant = merchantRes.rows[0];

      // 2. Get API keys (prefix only, no raw keys)
      const keysRes = await client.query(
        'SELECT substring(key_hash, 1, 8) as prefix, created_at, last_used_at FROM api_keys WHERE merchant_id = $1 ORDER BY created_at DESC',
        [merchantId],
      );

      // 3. Get audit log (last 1000)
      const auditRes = await client.query(
        'SELECT action, created_at, ip_address, details FROM audit_log WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 1000',
        [merchantId],
      );

      // 4. Get API key usage (last 1000) — approximated via audit_log entries
      const usageRes = await client.query(
        "SELECT action as endpoint, created_at, ip_address FROM audit_log WHERE merchant_id = $1 AND action LIKE 'api_key_use:%' ORDER BY created_at DESC LIMIT 1000",
        [merchantId],
      );

      const exportId = `export-${merchantId}-${Date.now()}`;

      return {
        exportId,
        merchantId,
        generatedAt: new Date().toISOString(),
        merchant: {
          id: merchant.id,
          name: merchant.name,
          email: merchant.email,
          createdAt: merchant.created_at?.toISOString() ?? '',
          status: merchant.status ?? 'active',
        },
        apiKeys: keysRes.rows.map(r => ({
          prefix: r.prefix,
          createdAt: r.created_at?.toISOString() ?? '',
          lastUsedAt: r.last_used_at?.toISOString() ?? null,
        })),
        auditLog: auditRes.rows.map(r => ({
          action: r.action,
          timestamp: r.created_at?.toISOString() ?? '',
          ip: r.ip_address ?? null,
          details: r.details ?? {},
        })),
        apiKeyUsage: usageRes.rows.map(r => ({
          keyPrefix: 'unknown',
          endpoint: r.endpoint,
          timestamp: r.created_at?.toISOString() ?? '',
          ip: r.ip_address ?? '',
        })),
      };
    } finally {
      client.release();
    }
  }
}
