/**
 * SignalRisk Decision Gateway
 *
 * WebSocket gateway for real-time decision broadcasting.
 * Emits 'decision' events to tenant-isolated rooms.
 * Uses WsJwtGuard with RS256 JWKS verification (fetches public key from auth-service).
 * Throttles to max 50 events per second.
 */

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import {
  Logger,
  CanActivate,
  ExecutionContext,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecisionBroadcastEvent {
  decisionId: string;
  merchantId: string;
  entityId: string;
  action: 'ALLOW' | 'REVIEW' | 'BLOCK';
  riskScore: number;
  timestamp: string;
  topRiskFactors: string[];
}

// ---------------------------------------------------------------------------
// WsJwtGuard — RS256 JWKS verification
// ---------------------------------------------------------------------------

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);
  private jwksCache: Map<string, crypto.KeyObject> = new Map();
  private jwksCacheExpiry = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly authServiceUrl: string;

  constructor() {
    this.authServiceUrl =
      process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
  }

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const token =
      (client.handshake?.auth as Record<string, string>)?.token ??
      (client.handshake?.headers?.authorization ?? '').replace('Bearer ', '');

    if (!token) {
      this.logger.warn('WsJwtGuard: no token provided');
      return false;
    }

    try {
      // Decode header to get kid
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || typeof decoded === 'string') {
        this.logger.warn('WsJwtGuard: invalid token format');
        return false;
      }

      const publicKey = await this.getPublicKey(decoded.header.kid);
      if (!publicKey) {
        this.logger.warn('WsJwtGuard: no matching public key found');
        return false;
      }

      const payload = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
      }) as jwt.JwtPayload;

      if (!payload || !payload.sub) {
        this.logger.warn('WsJwtGuard: missing sub claim');
        return false;
      }

      // Store merchant context on socket for room assignment
      const merchantId =
        payload.merchant_id || payload.merchantId || payload.sub;
      const role = payload.role || 'merchant';
      (client as any).data = { merchantId, role, userId: payload.sub };

      return true;
    } catch (err) {
      this.logger.warn(
        `WsJwtGuard: token verification failed — ${(err as Error).message}`,
      );
      return false;
    }
  }

  private async getPublicKey(
    kid?: string,
  ): Promise<crypto.KeyObject | null> {
    if (Date.now() > this.jwksCacheExpiry || this.jwksCache.size === 0) {
      await this.fetchJwks();
    }
    if (!kid) {
      const firstKey = this.jwksCache.values().next().value;
      return firstKey || null;
    }
    let key = this.jwksCache.get(kid);
    if (!key) {
      await this.fetchJwks();
      key = this.jwksCache.get(kid);
    }
    return key || null;
  }

  private async fetchJwks(): Promise<void> {
    try {
      const url = `${this.authServiceUrl}/.well-known/jwks.json`;
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`JWKS fetch failed: HTTP ${response.status}`);
        return;
      }
      const data = (await response.json()) as {
        keys: Array<{
          kty: string;
          use: string;
          kid: string;
          alg: string;
          n: string;
          e: string;
          [key: string]: unknown;
        }>;
      };
      const newCache = new Map<string, crypto.KeyObject>();
      for (const jwk of data.keys) {
        if (jwk.kty === 'RSA' && jwk.alg === 'RS256') {
          const publicKey = crypto.createPublicKey({
            key: jwk as crypto.JsonWebKey,
            format: 'jwk',
          });
          newCache.set(jwk.kid, publicKey);
        }
      }
      this.jwksCache = newCache;
      this.jwksCacheExpiry = Date.now() + this.CACHE_TTL_MS;
      this.logger.log(`JWKS cache refreshed: ${newCache.size} key(s)`);
    } catch (err) {
      this.logger.warn(
        `Failed to fetch JWKS from auth-service: ${(err as Error).message}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// DecisionGateway
// ---------------------------------------------------------------------------

@UseGuards(WsJwtGuard)
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/ws/decisions' })
export class DecisionGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DecisionGateway.name);

  // Throttle state: count of emits in the current 1-second window
  private emitCount = 0;
  private windowStart = Date.now();
  private readonly THROTTLE_LIMIT = 50;
  private readonly WINDOW_MS = 1000;

  handleConnection(client: Socket) {
    const data = (client as any).data;
    if (!data?.merchantId) {
      this.logger.warn(
        `Client ${client.id} connected without auth context — disconnecting`,
      );
      client.disconnect(true);
      return;
    }
    if (data.role === 'admin') {
      client.join('admin');
      this.logger.log(`Admin client connected: ${client.id}`);
    } else {
      client.join(`merchant:${data.merchantId}`);
      this.logger.log(
        `Client connected: ${client.id} (merchant: ${data.merchantId})`,
      );
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Broadcast a decision event to the relevant merchant room and admins.
   * Drops the event if more than 50 events have been emitted in the last second.
   */
  broadcastDecision(event: DecisionBroadcastEvent): void {
    const now = Date.now();

    // Reset counter if the window has passed
    if (now - this.windowStart >= this.WINDOW_MS) {
      this.emitCount = 0;
      this.windowStart = now;
    }

    if (this.emitCount >= this.THROTTLE_LIMIT) {
      this.logger.warn(
        `Throttle limit reached (${this.THROTTLE_LIMIT}/s) — dropping decision event: ${event.decisionId}`,
      );
      return;
    }

    this.emitCount++;
    // Tenant-isolated broadcast
    this.server
      .to(`merchant:${event.merchantId}`)
      .emit('decision', event);
    this.server.to('admin').emit('decision', event);
    this.logger.debug(
      `Broadcasted decision: ${event.decisionId} (action=${event.action}, merchant=${event.merchantId})`,
    );
  }

  /** Exposed for testing: reset throttle state */
  resetThrottle(): void {
    this.emitCount = 0;
    this.windowStart = Date.now();
  }
}
