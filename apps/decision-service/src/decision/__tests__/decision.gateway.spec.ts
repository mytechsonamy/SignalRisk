/**
 * Tests for DecisionGateway and WsJwtGuard
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { DecisionGateway, WsJwtGuard, DecisionBroadcastEvent } from '../decision.gateway';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-secret';

function makeToken(payload: object, options?: jwt.SignOptions): string {
  return jwt.sign(payload, TEST_SECRET, options);
}

function makeExpiredToken(): string {
  return jwt.sign({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) - 60 }, TEST_SECRET);
}

function makeSocketContext(token: string | undefined): ExecutionContext {
  const client = {
    handshake: {
      auth: token !== undefined ? { token } : {},
      headers: {},
    },
  };
  return {
    switchToWs: () => ({
      getClient: () => client,
    }),
  } as unknown as ExecutionContext;
}

function makeDecisionEvent(overrides?: Partial<DecisionBroadcastEvent>): DecisionBroadcastEvent {
  return {
    decisionId: 'decision-001',
    merchantId: 'merchant-001',
    entityId: 'entity-001',
    action: 'ALLOW',
    riskScore: 30,
    timestamp: new Date().toISOString(),
    topRiskFactors: ['device.trustScore', 'velocity.txCount1h'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// WsJwtGuard tests
// ---------------------------------------------------------------------------

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;

  beforeEach(async () => {
    process.env.JWT_SECRET = TEST_SECRET;
    const module: TestingModule = await Test.createTestingModule({
      providers: [WsJwtGuard],
    }).compile();
    guard = module.get<WsJwtGuard>(WsJwtGuard);
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('returns true for a valid token with sub claim', () => {
    const token = makeToken({ sub: 'user-1' });
    const ctx = makeSocketContext(token);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns false for an expired token', () => {
    const token = makeExpiredToken();
    const ctx = makeSocketContext(token);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('returns false when token is missing (undefined)', () => {
    const ctx = makeSocketContext(undefined);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('returns false when token is an empty string', () => {
    const ctx = makeSocketContext('');
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('returns false for a token signed with wrong secret', () => {
    const token = jwt.sign({ sub: 'user-1' }, 'wrong-secret');
    const ctx = makeSocketContext(token);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('returns false for a malformed token string', () => {
    const ctx = makeSocketContext('not.a.valid.jwt');
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('returns false for a valid JWT without sub claim', () => {
    const token = makeToken({ role: 'analyst' });
    const ctx = makeSocketContext(token);
    expect(guard.canActivate(ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DecisionGateway tests
// ---------------------------------------------------------------------------

describe('DecisionGateway', () => {
  let gateway: DecisionGateway;
  let mockEmit: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DecisionGateway],
    }).compile();

    gateway = module.get<DecisionGateway>(DecisionGateway);

    // Mock the server's emit method
    mockEmit = jest.fn();
    (gateway as unknown as { server: { emit: jest.Mock } }).server = { emit: mockEmit };

    // Reset throttle state before each test
    gateway.resetThrottle();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('broadcastDecision emits a decision event with the correct payload', () => {
    const event = makeDecisionEvent({ action: 'BLOCK', riskScore: 85 });
    gateway.broadcastDecision(event);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith('decision', event);
  });

  it('broadcastDecision emits with the correct event name "decision"', () => {
    const event = makeDecisionEvent();
    gateway.broadcastDecision(event);
    const [eventName] = mockEmit.mock.calls[0];
    expect(eventName).toBe('decision');
  });

  it('broadcastDecision emits full payload structure', () => {
    const event = makeDecisionEvent({
      decisionId: 'dec-xyz',
      merchantId: 'merch-001',
      entityId: 'entity-abc',
      action: 'REVIEW',
      riskScore: 55,
      topRiskFactors: ['velocity.burstDetected', 'network.riskScore'],
    });
    gateway.broadcastDecision(event);

    const [, emittedPayload] = mockEmit.mock.calls[0];
    expect(emittedPayload).toMatchObject({
      decisionId: 'dec-xyz',
      merchantId: 'merch-001',
      entityId: 'entity-abc',
      action: 'REVIEW',
      riskScore: 55,
      topRiskFactors: ['velocity.burstDetected', 'network.riskScore'],
    });
  });

  it('allows up to 50 events per second', () => {
    for (let i = 0; i < 50; i++) {
      gateway.broadcastDecision(makeDecisionEvent({ decisionId: `decision-${i}` }));
    }
    expect(mockEmit).toHaveBeenCalledTimes(50);
  });

  it('drops events beyond the 50 per-second limit', () => {
    for (let i = 0; i < 55; i++) {
      gateway.broadcastDecision(makeDecisionEvent({ decisionId: `decision-${i}` }));
    }
    // At most 50 emits should happen
    expect(mockEmit.mock.calls.length).toBeLessThanOrEqual(50);
  });

  it('throttle counter resets after 1 second window', async () => {
    // Exhaust the limit
    for (let i = 0; i < 50; i++) {
      gateway.broadcastDecision(makeDecisionEvent({ decisionId: `decision-${i}` }));
    }

    // One more should be dropped
    gateway.broadcastDecision(makeDecisionEvent({ decisionId: 'should-drop' }));
    expect(mockEmit.mock.calls.length).toBe(50);

    // Force-advance the window start to simulate 1s passing
    (gateway as unknown as { windowStart: number }).windowStart = Date.now() - 1001;
    gateway.broadcastDecision(makeDecisionEvent({ decisionId: 'after-reset' }));
    expect(mockEmit.mock.calls.length).toBe(51);
  });

  it('ALLOW action events are emitted correctly', () => {
    const event = makeDecisionEvent({ action: 'ALLOW', riskScore: 10 });
    gateway.broadcastDecision(event);
    expect(mockEmit).toHaveBeenCalledWith('decision', expect.objectContaining({ action: 'ALLOW' }));
  });

  it('BLOCK action events are emitted correctly', () => {
    const event = makeDecisionEvent({ action: 'BLOCK', riskScore: 90 });
    gateway.broadcastDecision(event);
    expect(mockEmit).toHaveBeenCalledWith('decision', expect.objectContaining({ action: 'BLOCK' }));
  });

  it('handleConnection logs client connection', () => {
    const logSpy = jest.spyOn(gateway['logger'], 'log').mockImplementation(() => undefined);
    const mockSocket = { id: 'socket-abc' } as unknown as import('socket.io').Socket;
    gateway.handleConnection(mockSocket);
    expect(logSpy).toHaveBeenCalledWith('Client connected: socket-abc');
    logSpy.mockRestore();
  });

  it('handleDisconnect logs client disconnection', () => {
    const logSpy = jest.spyOn(gateway['logger'], 'log').mockImplementation(() => undefined);
    const mockSocket = { id: 'socket-abc' } as unknown as import('socket.io').Socket;
    gateway.handleDisconnect(mockSocket);
    expect(logSpy).toHaveBeenCalledWith('Client disconnected: socket-abc');
    logSpy.mockRestore();
  });
});
