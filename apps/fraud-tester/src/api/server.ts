/**
 * FraudTester HTTP + Socket.io API Server
 *
 * Provides REST endpoints for launching/stopping battles and a
 * Socket.io channel for real-time result streaming.
 *
 * Routes:
 *   GET  /health                          → { status: 'ok', latencyMs: 0 }
 *   POST /v1/fraud-tester/battles         → { battleId }
 *   GET  /v1/fraud-tester/battles         → BattleEntry[]
 *   GET  /v1/fraud-tester/battles/:id     → BattleEntry
 *   POST /v1/fraud-tester/battles/:id/stop → { ok: true }
 *   GET  /v1/fraud-tester/health          → { status: 'ok', latencyMs: 0 }
 *
 * Socket.io events (server → client):
 *   battle:result      AttackResult from fraud-tester types
 *   battle:scenarioDone ScenarioResult
 *   battle:complete    BattleReport
 *
 * Socket.io events (client → server):
 *   join:battle        battleId — subscribe to a running battle room
 */

import * as http from 'http';
import * as crypto from 'crypto';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { FraudSimulationAgent } from '../agents/fraud-simulation.agent';
import { SignalRiskAdapter } from '../adapters/signalrisk.adapter';
import type { BattleReport, ScenarioResult } from '../scenarios/types';
import type { AttackResult } from '../scenarios/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BattleEntry {
  battleId: string;
  status: 'running' | 'completed' | 'stopped';
  startedAt: string;
  completedAt?: string;
  report?: BattleReport;
}

interface BattleConfig {
  targetName?: string;
  baseUrl?: string;
  decisionUrl?: string;
  apiKey?: string;
  merchantId?: string;
  duration?: string;
  intensity?: string;
  enabledScenarios?: string[];
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const battles = new Map<string, {
  entry: BattleEntry;
  agent?: FraudSimulationAgent;
}>();

// ─── Factory ──────────────────────────────────────────────────────────────────

function createAdapter(config: BattleConfig) {
  return new SignalRiskAdapter({
    baseUrl: config.baseUrl ?? process.env['SIGNALRISK_BASE_URL'] ?? 'http://localhost:3002',
    decisionUrl: config.decisionUrl ?? process.env['SIGNALRISK_DECISION_URL'] ?? 'http://localhost:3009',
    apiKey: config.apiKey ?? process.env['SIGNALRISK_API_KEY'] ?? 'sk_test_00000000000000000000000000000000',
    merchantId: config.merchantId ?? process.env['SIGNALRISK_MERCHANT_ID'] ?? 'test-merchant',
  });
}

// ─── Server factory ───────────────────────────────────────────────────────────

export function createServer(port = 3020): http.Server {
  const app = express();
  app.use(express.json());

  // CORS for dashboard dev server
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const server = http.createServer(app);

  const io = new SocketServer(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io',
  });

  // ── Socket.io ──────────────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log(`[FraudTester] Socket connected: ${socket.id}`);

    socket.on('join:battle', (battleId: string) => {
      const battle = battles.get(battleId);
      if (!battle) {
        socket.emit('error', { message: `Battle ${battleId} not found` });
        return;
      }
      void socket.join(`battle:${battleId}`);
      console.log(`[FraudTester] Socket ${socket.id} joined battle:${battleId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[FraudTester] Socket disconnected: ${socket.id}`);
    });
  });

  // ── Routes ─────────────────────────────────────────────────────────────────

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', latencyMs: 0, timestamp: new Date().toISOString() });
  });

  app.get('/v1/fraud-tester/health', (_req, res) => {
    res.json({ status: 'ok', latencyMs: 0, timestamp: new Date().toISOString() });
  });

  // List battles
  app.get('/v1/fraud-tester/battles', (_req, res) => {
    const list: BattleEntry[] = [];
    for (const { entry } of battles.values()) {
      list.push(entry);
    }
    // Most recent first
    list.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    res.json(list);
  });

  // Get single battle
  app.get('/v1/fraud-tester/battles/:id', (req, res) => {
    const battle = battles.get(req.params['id'] ?? '');
    if (!battle) {
      res.status(404).json({ message: 'Battle not found' });
      return;
    }
    res.json(battle.entry);
  });

  // Start battle
  app.post('/v1/fraud-tester/battles', (req, res) => {
    const config: BattleConfig = (req.body as BattleConfig) ?? {};
    const battleId = `battle-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const entry: BattleEntry = {
      battleId,
      status: 'running',
      startedAt: new Date().toISOString(),
    };

    const agent = new FraudSimulationAgent();

    battles.set(battleId, { entry, agent });

    // Enforce FIFO cap of 100 battles
    if (battles.size > 100) {
      const oldest = battles.keys().next().value;
      if (oldest) battles.delete(oldest);
    }

    // Wire up real-time events
    agent.on('result', (result: AttackResult) => {
      // Map fraud-tester AttackResult → dashboard-friendly shape
      const payload = {
        id: result.event.eventId,
        scenarioName: (result.event.metadata['scenarioName'] as string | undefined) ?? 'Unknown',
        decision: result.decision.decision === 'BLOCK' ? 'BLOCKED'
          : result.decision.decision === 'REVIEW' ? 'DETECTED'
          : 'MISSED',
        riskScore: result.decision.riskScore,
        latencyMs: result.decision.latencyMs,
        timestamp: new Date().toISOString(),
      };
      io.to(`battle:${battleId}`).emit('battle:result', payload);
    });

    agent.on('scenarioDone', (scenarioResult: ScenarioResult) => {
      io.to(`battle:${battleId}`).emit('battle:scenarioDone', scenarioResult);
    });

    agent.on('complete', (report: BattleReport) => {
      entry.status = 'completed';
      entry.completedAt = new Date().toISOString();
      entry.report = report;
      io.to(`battle:${battleId}`).emit('battle:complete', report);
      console.log(`[FraudTester] Battle ${battleId} completed. TPR=${(report.overallTpr * 100).toFixed(1)}%`);
    });

    // Run asynchronously — fire and forget
    const adapter = createAdapter(config);
    agent.run(adapter).catch((err: unknown) => {
      entry.status = 'stopped';
      entry.completedAt = new Date().toISOString();
      console.error(`[FraudTester] Battle ${battleId} errored:`, err instanceof Error ? err.message : err);
    });

    res.status(201).json({ battleId });
  });

  // Stop battle
  app.post('/v1/fraud-tester/battles/:id/stop', (req, res) => {
    const battle = battles.get(req.params['id'] ?? '');
    if (!battle) {
      res.status(404).json({ message: 'Battle not found' });
      return;
    }
    if (battle.agent) {
      battle.agent.stop();
    }
    battle.entry.status = 'stopped';
    battle.entry.completedAt = new Date().toISOString();
    res.json({ ok: true });
  });

  // ── Start ──────────────────────────────────────────────────────────────────
  server.listen(port, () => {
    console.log(`[FraudTester] HTTP + Socket.io server running on http://localhost:${port}`);
  });

  return server;
}

// ── Entrypoint when run directly ───────────────────────────────────────────────
if (require.main === module) {
  const port = parseInt(process.env['PORT'] ?? '3020', 10);
  createServer(port);
}
