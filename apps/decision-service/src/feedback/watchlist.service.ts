import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';

export interface WatchlistCheckResult {
  isDenylisted: boolean;
  isWatchlisted: boolean;
  isAllowlisted: boolean;
  denylistReason?: string;
  watchlistReason?: string;
}

@Injectable()
export class WatchlistService {
  private readonly logger = new Logger(WatchlistService.name);

  constructor(private readonly pool: Pool) {}

  /**
   * Check watchlist status for an entity.
   * Returns active list_type entries with 50ms timeout (ADR-014 pattern).
   * Precedence: denylist > watchlist > allowlist
   */
  async checkWatchlist(
    merchantId: string,
    entityId: string,
    entityType: 'customer' | 'device' | 'ip' = 'customer',
  ): Promise<WatchlistCheckResult> {
    const fallback: WatchlistCheckResult = {
      isDenylisted: false,
      isWatchlisted: false,
      isAllowlisted: false,
    };

    let client: any;
    try {
      const result = await Promise.race([
        (async () => {
          const conn = await this.pool.connect();
          client = conn;

          await conn.query("SELECT set_config('app.merchant_id', $1, true)", [merchantId]);

          const { rows } = await conn.query(
            `SELECT list_type, reason FROM watchlist_entries
             WHERE merchant_id = $1 AND entity_type = $2 AND entity_id = $3
               AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())`,
            [merchantId, entityType, entityId],
          );

          const check: WatchlistCheckResult = {
            isDenylisted: false,
            isWatchlisted: false,
            isAllowlisted: false,
          };

          for (const row of rows) {
            if (row.list_type === 'denylist') {
              check.isDenylisted = true;
              check.denylistReason = row.reason;
            } else if (row.list_type === 'watchlist') {
              check.isWatchlisted = true;
              check.watchlistReason = row.reason;
            } else if (row.list_type === 'allowlist') {
              check.isAllowlisted = true;
            }
          }

          return check;
        })(),
        new Promise<WatchlistCheckResult>((resolve) =>
          setTimeout(() => {
            this.logger.warn(`Watchlist check timeout (50ms) for entity ${entityId}`);
            resolve(fallback);
          }, 50),
        ),
      ]);

      return result;
    } catch (err) {
      this.logger.warn(
        `Watchlist check failed for entity ${entityId}: ${(err as Error).message}`,
      );
      return fallback;
    } finally {
      client?.release();
    }
  }
}
