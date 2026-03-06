/**
 * FraudTester — HTTP Server Unit Tests (T25)
 *
 * 6 tests covering:
 *   1. POST /battles → 201, battleId returned
 *   2. POST /battles (concurrent second) → 409 conflict
 *   3. GET /battles → array returned
 *   4. GET /battles/:id → battle detail
 *   5. POST /battles/:id/stop → 200, status stopped
 *   6. GET /battles/nonexistent → 404
 */

import request from 'supertest';
import * as http from 'http';

// ─── Mock FraudSimulationAgent ────────────────────────────────────────────────
// Mock BEFORE importing server so the factory picks up the mock.
// The mock agent never resolves its run() promise during these tests (unless
// we explicitly resolve it), which lets us test the 'running' state cleanly.

let resolveRun: (() => void) | null = null;

jest.mock('../agents/fraud-simulation.agent', () => {
  const { EventEmitter } = require('events');

  class FraudSimulationAgent extends EventEmitter {
    readonly name = 'FraudSimulationAgent';
    private _status: 'idle' | 'running' | 'stopped' = 'idle';

    async run(_adapter: unknown): Promise<unknown> {
      this._status = 'running';
      return new Promise<void>((resolve) => {
        resolveRun = resolve;
      }).then(() => {
        this._status = 'idle';
        const report = {
          id: 'report-1',
          timestamp: new Date(),
          targetAdapter: 'MockAdapter',
          scenarios: [],
          overallTpr: 0.8,
          overallFpr: 0.1,
          avgLatencyMs: 50,
        };
        this.emit('complete', report);
        return report;
      });
    }

    stop(): void {
      this._status = 'stopped';
      if (resolveRun) {
        resolveRun();
        resolveRun = null;
      }
    }

    getStatus() {
      return this._status;
    }
  }

  return { FraudSimulationAgent };
});

// Also mock SignalRiskAdapter and MockAdapter so no network calls happen
jest.mock('../adapters/signalrisk.adapter', () => {
  return {
    SignalRiskAdapter: jest.fn().mockImplementation(() => ({
      name: 'SignalRisk',
      submitEvent: jest.fn().mockResolvedValue({ eventId: 'e1', decision: 'BLOCK', riskScore: 0.9, latencyMs: 10 }),
      getDecision: jest.fn().mockResolvedValue(null),
      reset: jest.fn().mockResolvedValue(undefined),
      healthCheck: jest.fn().mockResolvedValue(true),
    })),
  };
});

jest.mock('../adapters/mock.adapter', () => {
  return {
    MockAdapter: jest.fn().mockImplementation(() => ({
      name: 'MockAdapter',
      submitEvent: jest.fn().mockResolvedValue({ eventId: 'e1', decision: 'BLOCK', riskScore: 0.9, latencyMs: 10 }),
      getDecision: jest.fn().mockResolvedValue(null),
      reset: jest.fn().mockResolvedValue(undefined),
      healthCheck: jest.fn().mockResolvedValue(true),
    })),
  };
});

import { createServer } from '../api/server';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FraudTester API Server', () => {
  let server: http.Server;
  let app: http.Server;

  beforeAll(() => {
    // Create server on a random available port (0 = OS assigns)
    server = createServer(0);
    app = server;
  });

  afterAll((done) => {
    // Resolve any pending run so agent teardown is clean
    if (resolveRun) {
      resolveRun();
      resolveRun = null;
    }
    server.close(done);
  });

  // Reset resolveRun before each test
  beforeEach(() => {
    resolveRun = null;
  });

  // ── Test 1: POST /battles → 201, battleId ──────────────────────────────────
  it('POST /battles returns 201 with battleId', async () => {
    const res = await request(app)
      .post('/v1/fraud-tester/battles')
      .send({ targetAdapter: 'mock' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('battleId');
    expect(typeof res.body.battleId).toBe('string');
    expect(res.body.battleId).toMatch(/^battle-/);
  });

  // ── Test 2: Concurrent POST → 409 ─────────────────────────────────────────
  it('POST /battles returns 409 when a battle is already running', async () => {
    // First battle should already be running from test 1.
    // If it resolved, start another to put one in running state.
    // We start a fresh one; the mock agent's run() stays pending until stopped.
    // (The previous test's battle may or may not still be running — we check
    //  the response and handle both cases.)

    // Start a new battle first (to ensure at least one is running)
    const startRes = await request(app)
      .post('/v1/fraud-tester/battles')
      .send({ targetAdapter: 'mock' })
      .set('Content-Type', 'application/json');

    if (startRes.status === 409) {
      // There's already a running battle from test 1 — perfect, 409 confirmed
      expect(startRes.status).toBe(409);
      expect(startRes.body).toHaveProperty('error');
    } else {
      // We just started one. Now immediately try a second.
      expect(startRes.status).toBe(201);

      const conflictRes = await request(app)
        .post('/v1/fraud-tester/battles')
        .send({ targetAdapter: 'mock' })
        .set('Content-Type', 'application/json');

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body).toHaveProperty('error');
    }
  });

  // ── Test 3: GET /battles → list ────────────────────────────────────────────
  it('GET /battles returns an array', async () => {
    const res = await request(app).get('/v1/fraud-tester/battles');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // There should be at least 1 battle from the previous tests
    expect(res.body.length).toBeGreaterThan(0);
  });

  // ── Test 4: GET /battles/:id → detail ─────────────────────────────────────
  it('GET /battles/:id returns battle detail', async () => {
    // Get the list first to find an existing battle id
    const listRes = await request(app).get('/v1/fraud-tester/battles');
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBeGreaterThan(0);

    const battleId: string = (listRes.body[0] as { battleId: string }).battleId;

    const res = await request(app).get(`/v1/fraud-tester/battles/${battleId}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('battleId', battleId);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('startedAt');
  });

  // ── Test 5: POST /battles/:id/stop → 200 stopped ──────────────────────────
  it('POST /battles/:id/stop returns 200 with ok:true', async () => {
    // Find a running battle to stop
    const listRes = await request(app).get('/v1/fraud-tester/battles');
    expect(listRes.status).toBe(200);

    const runningBattle = (listRes.body as Array<{ battleId: string; status: string }>)
      .find((b) => b.status === 'running');

    if (!runningBattle) {
      // All battles already stopped — start a fresh one
      const startRes = await request(app)
        .post('/v1/fraud-tester/battles')
        .send({ targetAdapter: 'mock' })
        .set('Content-Type', 'application/json');
      // If 409, someone else is running — find that one
      if (startRes.status === 409) {
        const list2 = await request(app).get('/v1/fraud-tester/battles');
        const running2 = (list2.body as Array<{ battleId: string; status: string }>)
          .find((b) => b.status === 'running');
        if (running2) {
          const stopRes = await request(app)
            .post(`/v1/fraud-tester/battles/${running2.battleId}/stop`);
          expect(stopRes.status).toBe(200);
          expect(stopRes.body).toHaveProperty('ok', true);
          return;
        }
      } else {
        expect(startRes.status).toBe(201);
        const { battleId } = startRes.body as { battleId: string };
        const stopRes = await request(app)
          .post(`/v1/fraud-tester/battles/${battleId}/stop`);
        expect(stopRes.status).toBe(200);
        expect(stopRes.body).toHaveProperty('ok', true);
        return;
      }
    }

    const battleId = runningBattle!.battleId;
    const res = await request(app).post(`/v1/fraud-tester/battles/${battleId}/stop`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });

  // ── Test 6: GET /battles/nonexistent → 404 ─────────────────────────────────
  it('GET /battles/nonexistent returns 404', async () => {
    const res = await request(app).get('/v1/fraud-tester/battles/nonexistent-battle-id-xyz');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('message');
  });
});
