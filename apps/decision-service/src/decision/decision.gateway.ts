/**
 * SignalRisk Decision Gateway
 *
 * WebSocket gateway for real-time decision broadcasting.
 * Emits 'decision' events to all connected clients.
 * Uses WsJwtGuard to verify Bearer tokens from handshake.auth.token.
 * Throttles to max 50 events per second.
 */

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';

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
// WsJwtGuard
// ---------------------------------------------------------------------------

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const token =
      (client.handshake?.auth as Record<string, string>)?.token ??
      (client.handshake?.headers?.authorization ?? '').replace('Bearer ', '');

    if (!token) {
      this.logger.warn('WsJwtGuard: no token provided');
      return false;
    }

    try {
      const secret = process.env.JWT_SECRET ?? 'test-secret';
      const payload = jwt.verify(token, secret) as jwt.JwtPayload;

      // Validate required claims
      if (!payload || !payload.sub) {
        this.logger.warn('WsJwtGuard: missing sub claim');
        return false;
      }

      // Check expiry explicitly (jwt.verify already throws if expired,
      // but we guard against missing exp too)
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        this.logger.warn('WsJwtGuard: token expired');
        return false;
      }

      return true;
    } catch (err) {
      this.logger.warn(`WsJwtGuard: token verification failed — ${(err as Error).message}`);
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// DecisionGateway
// ---------------------------------------------------------------------------

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/ws/decisions' })
export class DecisionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DecisionGateway.name);

  // Throttle state: count of emits in the current 1-second window
  private emitCount = 0;
  private windowStart = Date.now();
  private readonly THROTTLE_LIMIT = 50;
  private readonly WINDOW_MS = 1000;

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Broadcast a decision event to all connected clients.
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
    this.server.emit('decision', event);
    this.logger.debug(`Broadcasted decision: ${event.decisionId} (action=${event.action})`);
  }

  /** Exposed for testing: reset throttle state */
  resetThrottle(): void {
    this.emitCount = 0;
    this.windowStart = Date.now();
  }
}
