import { Pool } from 'pg';

export interface RefreshTokenEntity {
  id: string;
  userId: string;
  merchantId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/**
 * PostgreSQL-backed refresh token store.
 * Uses the refresh_tokens table (migration 004).
 */
export class RefreshTokenStore {
  constructor(private readonly pool: Pool) {}

  async save(entity: RefreshTokenEntity): Promise<void> {
    await this.pool.query(
      `INSERT INTO refresh_tokens (id, user_id, merchant_id, token_hash, expires_at, revoked_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         token_hash = EXCLUDED.token_hash,
         expires_at = EXCLUDED.expires_at,
         revoked_at = EXCLUDED.revoked_at`,
      [
        entity.id,
        entity.userId,
        entity.merchantId,
        entity.tokenHash,
        entity.expiresAt,
        entity.revokedAt,
        entity.createdAt,
      ],
    );
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshTokenEntity | undefined> {
    const result = await this.pool.query(
      `SELECT id, user_id, merchant_id, token_hash, expires_at, revoked_at, created_at
       FROM refresh_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    if (result.rows.length === 0) return undefined;
    return this.rowToEntity(result.rows[0]);
  }

  async findById(id: string): Promise<RefreshTokenEntity | undefined> {
    const result = await this.pool.query(
      `SELECT id, user_id, merchant_id, token_hash, expires_at, revoked_at, created_at
       FROM refresh_tokens WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return undefined;
    return this.rowToEntity(result.rows[0]);
  }

  async revokeById(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async revokeByTokenHash(tokenHash: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    return result.rowCount ?? 0;
  }

  isValid(entity: RefreshTokenEntity): boolean {
    if (entity.revokedAt) return false;
    if (entity.expiresAt < new Date()) return false;
    return true;
  }

  async purgeExpired(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM refresh_tokens WHERE expires_at < NOW()`,
    );
    return result.rowCount ?? 0;
  }

  private rowToEntity(row: Record<string, any>): RefreshTokenEntity {
    return {
      id: row.id,
      userId: row.user_id,
      merchantId: row.merchant_id,
      tokenHash: row.token_hash,
      expiresAt: new Date(row.expires_at),
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      createdAt: new Date(row.created_at),
    };
  }
}
