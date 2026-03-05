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
 * In-memory refresh token store.
 * Replace with database-backed repository in production
 * (uses the refresh_tokens table from migration 004).
 */
export class RefreshTokenStore {
  private tokens: Map<string, RefreshTokenEntity> = new Map();

  save(entity: RefreshTokenEntity): void {
    this.tokens.set(entity.id, entity);
  }

  findByTokenHash(tokenHash: string): RefreshTokenEntity | undefined {
    for (const entity of this.tokens.values()) {
      if (entity.tokenHash === tokenHash) {
        return entity;
      }
    }
    return undefined;
  }

  findById(id: string): RefreshTokenEntity | undefined {
    return this.tokens.get(id);
  }

  revokeById(id: string): boolean {
    const entity = this.tokens.get(id);
    if (!entity) return false;
    entity.revokedAt = new Date();
    return true;
  }

  revokeByTokenHash(tokenHash: string): boolean {
    const entity = this.findByTokenHash(tokenHash);
    if (!entity) return false;
    entity.revokedAt = new Date();
    return true;
  }

  revokeAllForUser(userId: string): number {
    let count = 0;
    for (const entity of this.tokens.values()) {
      if (entity.userId === userId && !entity.revokedAt) {
        entity.revokedAt = new Date();
        count++;
      }
    }
    return count;
  }

  isValid(entity: RefreshTokenEntity): boolean {
    if (entity.revokedAt) return false;
    if (entity.expiresAt < new Date()) return false;
    return true;
  }

  /**
   * Clean up expired tokens (call periodically).
   */
  purgeExpired(): number {
    const now = new Date();
    let count = 0;
    for (const [id, entity] of this.tokens.entries()) {
      if (entity.expiresAt < now) {
        this.tokens.delete(id);
        count++;
      }
    }
    return count;
  }
}
