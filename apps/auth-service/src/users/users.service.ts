import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { Pool } from 'pg';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { PG_POOL } from '../merchants/constants';

export interface AdminUserDto {
  id: string;
  email: string;
  role: 'admin' | 'analyst' | 'viewer';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_MAP_TO_DB: Record<string, string> = {
  admin: 'ADMIN',
  analyst: 'ANALYST',
  viewer: 'VIEWER',
};

const ROLE_MAP_FROM_DB: Record<string, string> = {
  ADMIN: 'admin',
  SENIOR_ANALYST: 'analyst',
  ANALYST: 'analyst',
  VIEWER: 'viewer',
};

@Injectable()
export class UsersService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAllByMerchant(merchantId: string): Promise<AdminUserDto[]> {
    const result = await this.pool.query(
      `SELECT id, email, role, created_at
       FROM users
       WHERE merchant_id = $1
       ORDER BY created_at`,
      [merchantId],
    );
    return result.rows.map((row) => this.rowToDto(row));
  }

  async findByEmail(
    email: string,
  ): Promise<{
    id: string;
    email: string;
    role: string;
    merchantId: string;
    passwordHash: string;
  } | null> {
    const result = await this.pool.query(
      `SELECT id, email, role, merchant_id, password_hash FROM users WHERE email = $1 LIMIT 1`,
      [email],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      role: (ROLE_MAP_FROM_DB[row.role] || 'analyst') as string,
      merchantId: row.merchant_id,
      passwordHash: row.password_hash,
    };
  }

  async setPassword(
    merchantId: string,
    userId: string,
    newPassword: string,
  ): Promise<boolean> {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const result = await this.pool.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2 AND merchant_id = $3`,
      [passwordHash, userId, merchantId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async invite(
    merchantId: string,
    email: string,
    role: string,
  ): Promise<AdminUserDto & { tempPassword: string }> {
    const dbRole = ROLE_MAP_TO_DB[role] || 'ANALYST';

    // Check if user already exists for this merchant
    const existing = await this.pool.query(
      `SELECT id FROM users WHERE merchant_id = $1 AND email = $2`,
      [merchantId, email],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException('User with this email already exists');
    }

    const id = crypto.randomUUID();
    // Generate a random temporary password (user will reset via email in production)
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const result = await this.pool.query(
      `INSERT INTO users (id, merchant_id, email, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, $5::user_role, NOW())
       RETURNING id, email, role, created_at`,
      [id, merchantId, email, passwordHash, dbRole],
    );

    const dto = this.rowToDto(result.rows[0]);
    return { ...dto, tempPassword };
  }

  async deactivate(merchantId: string, userId: string): Promise<boolean> {
    // Soft-delete: we don't have a deleted_at column on users yet,
    // so we delete the row. In production, add deleted_at column.
    const result = await this.pool.query(
      `DELETE FROM users WHERE id = $1 AND merchant_id = $2`,
      [userId, merchantId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private rowToDto(row: Record<string, any>): AdminUserDto {
    return {
      id: row.id,
      email: row.email,
      role: (ROLE_MAP_FROM_DB[row.role] || 'analyst') as AdminUserDto['role'],
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
