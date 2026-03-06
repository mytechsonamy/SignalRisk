import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  path: '/socket.io',
});

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockCases = [
  {
    id: 'case-001',
    decisionId: 'dec-001',
    merchantId: 'merchant-001',
    entityId: 'device-abc123',
    action: 'REVIEW',
    riskScore: 72,
    status: 'OPEN',
    priority: 'HIGH',
    assignedTo: null,
    resolvedAt: null,
    slaDeadline: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
    riskFactors: [
      { signal: 'device_emulator', value: true, contribution: 45, description: 'Device is running in an emulator environment' },
      { signal: 'high_velocity', value: 32, contribution: 38, description: 'Transaction velocity exceeds normal threshold' },
      { signal: 'geo_mismatch', value: 'US/NG', contribution: 17, description: 'Billing country does not match device location' },
    ],
  },
  {
    id: 'case-002',
    decisionId: 'dec-002',
    merchantId: 'merchant-001',
    entityId: 'device-def456',
    action: 'BLOCK',
    riskScore: 95,
    status: 'OPEN',
    priority: 'HIGH',
    assignedTo: 'analyst@signalrisk.com',
    resolvedAt: null,
    slaDeadline: new Date(Date.now() + 14400000).toISOString(),
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date().toISOString(),
    riskFactors: [
      { signal: 'known_fraud_device', value: true, contribution: 60, description: 'Device fingerprint matches known fraud database' },
      { signal: 'card_testing', value: 8, contribution: 25, description: 'Multiple small transactions detected in short window' },
      { signal: 'high_amount', value: 9500, contribution: 15, description: 'Transaction amount significantly above average' },
    ],
  },
  {
    id: 'case-003',
    decisionId: 'dec-003',
    merchantId: 'merchant-002',
    entityId: 'device-ghi789',
    action: 'REVIEW',
    riskScore: 58,
    status: 'OPEN',
    priority: 'MEDIUM',
    assignedTo: null,
    resolvedAt: null,
    slaDeadline: new Date(Date.now() + 172800000).toISOString(),
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    updatedAt: new Date().toISOString(),
    riskFactors: [
      { signal: 'new_device', value: true, contribution: 35, description: 'First time this device has been seen' },
      { signal: 'unusual_hour', value: '02:30', contribution: 30, description: 'Transaction at unusual time of day' },
      { signal: 'ip_proxy', value: true, contribution: 35, description: 'IP address belongs to a known proxy network' },
    ],
  },
];

const mockUsers = [
  { id: 'user-1', email: 'admin@signalrisk.com', role: 'admin', isActive: true, lastLoginAt: '2026-03-06T09:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'user-2', email: 'analyst@signalrisk.com', role: 'analyst', isActive: true, lastLoginAt: '2026-03-05T14:30:00Z', createdAt: '2026-01-15T00:00:00Z' },
  { id: 'user-3', email: 'ops@signalrisk.com', role: 'analyst', isActive: false, lastLoginAt: null, createdAt: '2026-02-01T00:00:00Z' },
];

const mockRules = [
  { id: 'rule-001', name: 'High Velocity Block', expression: 'velocity.txn_per_min > 50', outcome: 'BLOCK', weight: 0.85, isActive: true },
  { id: 'rule-002', name: 'Device Emulator', expression: 'device.isEmulator == true', outcome: 'BLOCK', weight: 0.95, isActive: true },
  { id: 'rule-003', name: 'New Device + High Amount', expression: 'device.isNew && txn.amount > 5000', outcome: 'REVIEW', weight: 0.70, isActive: true },
  { id: 'rule-004', name: 'Geo Mismatch', expression: 'device.country != billing.country', outcome: 'REVIEW', weight: 0.60, isActive: false },
];

const mockServices = [
  { name: 'auth-service', port: 3001, status: 'healthy', latencyMs: 12, lastChecked: new Date().toISOString() },
  { name: 'decision-service', port: 3002, status: 'healthy', latencyMs: 42, lastChecked: new Date().toISOString() },
  { name: 'event-collector', port: 3003, status: 'healthy', latencyMs: 8, lastChecked: new Date().toISOString() },
  { name: 'velocity-service', port: 3004, status: 'healthy', latencyMs: 18, lastChecked: new Date().toISOString() },
  { name: 'device-intel-service', port: 3005, status: 'degraded', latencyMs: 210, lastChecked: new Date().toISOString() },
  { name: 'behavioral-service', port: 3006, status: 'healthy', latencyMs: 35, lastChecked: new Date().toISOString() },
  { name: 'network-intel-service', port: 3007, status: 'healthy', latencyMs: 22, lastChecked: new Date().toISOString() },
  { name: 'telco-intel-service', port: 3008, status: 'healthy', latencyMs: 19, lastChecked: new Date().toISOString() },
  { name: 'graph-intel-service', port: 3009, status: 'healthy', latencyMs: 55, lastChecked: new Date().toISOString() },
  { name: 'rule-engine-service', port: 3010, status: 'healthy', latencyMs: 14, lastChecked: new Date().toISOString() },
  { name: 'case-service', port: 3011, status: 'healthy', latencyMs: 28, lastChecked: new Date().toISOString() },
  { name: 'webhook-service', port: 3012, status: 'healthy', latencyMs: 9, lastChecked: new Date().toISOString() },
];

function generateTrends(days: number) {
  const points = [];
  const now = Date.now();
  for (let i = days; i >= 0; i--) {
    const ts = new Date(now - i * 86400000).toISOString().split('T')[0];
    points.push({
      date: ts,
      allow: Math.floor(800 + Math.random() * 400),
      review: Math.floor(80 + Math.random() * 60),
      block: Math.floor(20 + Math.random() * 30),
    });
  }
  return points;
}

function generateVelocity() {
  const points = [];
  const now = Date.now();
  for (let i = 23; i >= 0; i--) {
    const h = new Date(now - i * 3600000).getHours();
    points.push({
      hour: `${String(h).padStart(2, '0')}:00`,
      events: Math.floor(200 + Math.random() * 800),
    });
  }
  return points;
}

function generateMinuteTrend() {
  const points = [];
  const now = Date.now();
  for (let i = 59; i >= 0; i--) {
    const d = new Date(now - i * 60000);
    const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const base = 15 + Math.round(10 * Math.sin(i / 8));
    points.push({
      minute: label,
      ALLOW: base + Math.floor(Math.random() * 5),
      REVIEW: Math.floor(base * 0.12 + Math.random() * 2),
      BLOCK: Math.floor(base * 0.04 + Math.random()),
    });
  }
  return points;
}

function generateKpiStats() {
  const hourlyEvents = Math.floor(1100 + Math.random() * 400);
  const blockCount = Math.floor(hourlyEvents * (0.025 + Math.random() * 0.015));
  const reviewCount = Math.floor(hourlyEvents * (0.07 + Math.random() * 0.03));
  return {
    decisionsPerHour: hourlyEvents,
    blockRatePct: parseFloat(((blockCount / hourlyEvents) * 100).toFixed(1)),
    reviewRatePct: parseFloat(((reviewCount / hourlyEvents) * 100).toFixed(1)),
    avgLatencyMs: Math.floor(35 + Math.random() * 25),
  };
}

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------

app.post('/v1/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (email && password) {
    const user = mockUsers.find(u => u.email === email) ?? mockUsers[0];
    res.json({
      accessToken: 'mock-jwt-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: 86400,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.post('/v1/auth/logout', (_req: Request, res: Response) => res.status(204).send());
app.post('/v1/auth/refresh', (_req: Request, res: Response) => {
  res.json({ accessToken: 'mock-jwt-refreshed', expiresIn: 86400 });
});

// ---------------------------------------------------------------------------
// Cases routes
// ---------------------------------------------------------------------------

app.get('/v1/cases', (req: Request, res: Response) => {
  const { status, priority, action, search, page = '1' } = req.query;
  let cases = [...mockCases];
  if (status) cases = cases.filter(c => c.status === status);
  if (priority) cases = cases.filter(c => c.priority === priority);
  if (action) cases = cases.filter(c => c.action === action);
  if (search) {
    const q = (search as string).toLowerCase();
    cases = cases.filter(c =>
      c.entityId.toLowerCase().includes(q) ||
      c.merchantId.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q),
    );
  }
  res.json({ cases, total: cases.length, page: parseInt(page as string), pageSize: 20 });
});

app.get('/v1/cases/stats', (_req: Request, res: Response) => {
  const today = mockCases.filter(c => {
    const created = new Date(c.createdAt);
    const now = new Date();
    return created.toDateString() === now.toDateString();
  });
  const fraudConfirmed = today.filter(c => (c as any).resolution === 'FRAUD').length;
  const falsePositives = today.filter(c => (c as any).resolution === 'LEGITIMATE').length;
  const labeled = fraudConfirmed + falsePositives;
  res.json({
    today: {
      labeled,
      fraudConfirmed,
      falsePositives,
      inconclusive: 0,
      accuracy: labeled > 0 ? Math.round((fraudConfirmed / labeled) * 100) : 0,
    },
    pendingReview: mockCases.filter(c => c.status === 'OPEN').length,
  });
});

app.get('/v1/cases/export', (_req: Request, res: Response) => res.json(mockCases));

app.get('/v1/cases/:id', (req: Request, res: Response) => {
  const c = mockCases.find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ message: 'Not found' });
  const evidenceTimeline = [
    {
      timestamp: new Date(new Date(c.createdAt).getTime() - 5000).toISOString(),
      type: 'signal',
      description: 'Event received and scored by decision engine',
    },
    {
      timestamp: c.createdAt,
      type: 'rule_hit',
      description: `Decision ${c.action} with risk score ${c.riskScore}`,
    },
    {
      timestamp: new Date(new Date(c.createdAt).getTime() + 2000).toISOString(),
      type: 'case_created',
      description: 'Case created for manual review',
    },
  ];
  res.json({ ...c, evidenceTimeline });
});

app.patch('/v1/cases/:id', (_req: Request, res: Response) => res.json({ success: true }));

app.put('/v1/cases/:id/resolve', (req: Request, res: Response) => {
  const c = mockCases.find(c => c.id === req.params.id);
  if (c) { (c as any).status = 'RESOLVED'; (c as any).resolution = req.body.resolution; }
  res.json({ success: true });
});

app.put('/v1/cases/:id/escalate', (req: Request, res: Response) => {
  const c = mockCases.find(c => c.id === req.params.id);
  if (c) (c as any).status = 'ESCALATED';
  res.json({ success: true });
});

app.post('/v1/cases/bulk', (_req: Request, res: Response) => res.json({ updated: 2 }));

// ---------------------------------------------------------------------------
// Chargebacks
// ---------------------------------------------------------------------------

app.post('/v1/chargebacks', (_req: Request, res: Response) => res.status(204).send());

// ---------------------------------------------------------------------------
// Analytics — direct routes (/v1/analytics/...)
// AND proxy-style routes (/api/v1/analytics/...)
// ---------------------------------------------------------------------------

function analyticsRoutes(prefix: string) {
  app.get(`${prefix}/v1/analytics/kpi`, (_req: Request, res: Response) => {
    res.json(generateKpiStats());
  });

  app.get(`${prefix}/v1/analytics/minute-trend`, (_req: Request, res: Response) => {
    res.json(generateMinuteTrend());
  });

  app.get(`${prefix}/v1/analytics/trends`, (req: Request, res: Response) => {
    const days = parseInt((req.query.days as string) ?? '7', 10);
    res.json(generateTrends(days));
  });

  app.get(`${prefix}/v1/analytics/velocity`, (_req: Request, res: Response) => {
    res.json(generateVelocity());
  });

  app.get(`${prefix}/v1/analytics/risk-buckets`, (_req: Request, res: Response) => {
    res.json([
      { range: '0-10', count: 380 },
      { range: '10-20', count: 295 },
      { range: '20-30', count: 210 },
      { range: '30-40', count: 180 },
      { range: '40-50', count: 145 },
      { range: '50-60', count: 120 },
      { range: '60-70', count: 98 },
      { range: '70-80', count: 75 },
      { range: '80-90', count: 52 },
      { range: '90-100', count: 35 },
    ]);
  });

  app.get(`${prefix}/v1/analytics/merchants`, (_req: Request, res: Response) => {
    res.json([
      { merchantId: 'merchant-001', name: 'Acme Payments', eventVolume: 4210, blockRate: 0.032, avgRiskScore: 28 },
      { merchantId: 'merchant-002', name: 'SwiftPay', eventVolume: 1893, blockRate: 0.018, avgRiskScore: 21 },
      { merchantId: 'merchant-003', name: 'NovaTrade', eventVolume: 3024, blockRate: 0.051, avgRiskScore: 35 },
    ]);
  });

  // Legacy route names
  app.get(`${prefix}/v1/analytics/risk-scores`, (_req: Request, res: Response) => {
    res.json({ histogram: [{ range: '0-20', count: 412 }, { range: '80-100', count: 57 }] });
  });

  app.get(`${prefix}/v1/analytics/decisions`, (_req: Request, res: Response) => {
    res.json({ donut: [{ action: 'ALLOW', count: 1080 }, { action: 'BLOCK', count: 57 }, { action: 'REVIEW', count: 193 }] });
  });
}

analyticsRoutes('');
analyticsRoutes('/api');

// ---------------------------------------------------------------------------
// Admin routes (/api/v1/admin/...)
// ---------------------------------------------------------------------------

function adminRoutes(prefix: string) {
  app.get(`${prefix}/v1/admin/users`, (_req: Request, res: Response) => {
    res.json(mockUsers);
  });

  app.post(`${prefix}/v1/admin/users/invite`, (req: Request, res: Response) => {
    const { email, role } = req.body;
    const newUser = { id: `user-${Date.now()}`, email, role, isActive: true, lastLoginAt: null, createdAt: new Date().toISOString() };
    mockUsers.push(newUser);
    res.status(201).json(newUser);
  });

  app.delete(`${prefix}/v1/admin/users/:id`, (req: Request, res: Response) => {
    const idx = mockUsers.findIndex(u => u.id === req.params.id);
    if (idx !== -1) mockUsers[idx].isActive = false;
    res.status(204).send();
  });

  app.get(`${prefix}/v1/admin/health`, (_req: Request, res: Response) => {
    res.json(mockServices.map(s => ({ ...s, lastChecked: new Date().toISOString() })));
  });

  app.get(`${prefix}/v1/admin/rules`, (_req: Request, res: Response) => {
    res.json(mockRules);
  });

  app.post(`${prefix}/v1/admin/rules`, (req: Request, res: Response) => {
    const { name, expression, outcome, weight, isActive } = req.body;
    if (!name || !expression || !outcome) {
      return res.status(400).json({ message: 'name, expression, outcome are required' });
    }
    const newRule = {
      id: `rule-${Date.now()}`,
      name,
      expression,
      outcome,
      weight: weight ?? 0.5,
      isActive: isActive ?? true,
    };
    mockRules.push(newRule);
    return res.status(201).json(newRule);
  });

  app.patch(`${prefix}/v1/admin/rules/:id`, (req: Request, res: Response) => {
    const rule = mockRules.find(r => r.id === req.params.id);
    if (!rule) return res.status(404).json({ message: 'Not found' });
    Object.assign(rule, req.body);
    res.json(rule);
  });

  app.delete(`${prefix}/v1/admin/rules/:id`, (req: Request, res: Response) => {
    const idx = mockRules.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Not found' });
    mockRules.splice(idx, 1);
    return res.status(204).send();
  });
}

adminRoutes('');
adminRoutes('/api');

// ---------------------------------------------------------------------------
// Fraud-ops routes (/api/v1/cases for fraud-ops, /api/v1/chargebacks)
// ---------------------------------------------------------------------------

app.get('/api/v1/cases', (req: Request, res: Response) => {
  const { status, priority, action, search, page = '1' } = req.query;
  let cases = [...mockCases];
  if (status) cases = cases.filter(c => c.status === status);
  if (priority) cases = cases.filter(c => c.priority === priority);
  if (action) cases = cases.filter(c => c.action === action);
  if (search) {
    const q = (search as string).toLowerCase();
    cases = cases.filter(c =>
      c.entityId.toLowerCase().includes(q) ||
      c.merchantId.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q),
    );
  }
  res.json({ cases, total: cases.length, page: parseInt(page as string), pageSize: 20 });
});

app.get('/api/v1/cases/stats', (_req: Request, res: Response) => {
  const fraudConfirmed = mockCases.filter(c => (c as any).resolution === 'FRAUD').length;
  const falsePositives = mockCases.filter(c => (c as any).resolution === 'LEGITIMATE').length;
  const labeled = fraudConfirmed + falsePositives;
  res.json({
    today: {
      labeled,
      fraudConfirmed,
      falsePositives,
      inconclusive: 0,
      accuracy: labeled > 0 ? Math.round((fraudConfirmed / labeled) * 100) : 0,
    },
    pendingReview: mockCases.filter(c => c.status === 'OPEN').length,
  });
});

app.post('/api/v1/chargebacks', (_req: Request, res: Response) => res.status(204).send());

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

app.get('/v1/flags/:name/check', (_req: Request, res: Response) => {
  res.json({ enabled: false });
});

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------

app.get('/v1/merchants/:id', (req: Request, res: Response) => {
  res.json({ id: req.params.id, name: 'Test Merchant', email: 'test@merchant.com' });
});

// ---------------------------------------------------------------------------
// Events / Decisions
// ---------------------------------------------------------------------------

app.post('/v1/events', (_req: Request, res: Response) => {
  res.status(201).json({ eventId: `evt-${Date.now()}`, status: 'accepted' });
});

app.get('/v1/decisions', (_req: Request, res: Response) => {
  res.json({ decisions: [], total: 0, page: 1, pageSize: 20 });
});

// ---------------------------------------------------------------------------
// Signal services
// ---------------------------------------------------------------------------

app.post('/graph-intel/analyze', (_req: Request, res: Response) => {
  res.json({ riskScore: 10, connectedFraudCount: 0, sharedDeviceCount: 1, sharedIpCount: 1, fraudRingDetected: false });
});

app.get('/metrics/kafka-lag', (_req: Request, res: Response) => {
  res.type('text/plain').send('# HELP kafka_consumer_lag Consumer group lag\nkafka_consumer_lag{group="fraud-processors"} 0\n');
});

app.post('/network-intel/analyze', (_req: Request, res: Response) => {
  res.json({ riskScore: 15, ipRiskScore: 10, botScore: 5, isDatacenter: false, isTor: false, isProxy: false });
});

app.post('/telco-intel/analyze', (_req: Request, res: Response) => {
  res.json({ riskScore: 5, isVoip: false, isDisposable: false, isBurner: false, countryMismatch: false });
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// 404 fallback
// ---------------------------------------------------------------------------

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Route not found' });
});

// ---------------------------------------------------------------------------
// Socket.IO — emit mock decision events every 2s
// ---------------------------------------------------------------------------

const ACTIONS: Array<'ALLOW' | 'REVIEW' | 'BLOCK'> = ['ALLOW', 'ALLOW', 'ALLOW', 'ALLOW', 'REVIEW', 'REVIEW', 'BLOCK'];
const MERCHANTS = ['merchant-001', 'merchant-002', 'merchant-003'];
const RISK_FACTORS = ['high_velocity', 'device_emulator', 'geo_mismatch', 'new_device', 'burner_phone', 'vpn_detected'];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

io.on('connection', (socket) => {
  console.log(`WS client connected: ${socket.id}`);
  socket.on('disconnect', () => console.log(`WS client disconnected: ${socket.id}`));
});

setInterval(() => {
  if (io.engine.clientsCount === 0) return;
  const action = randomItem(ACTIONS);
  const riskScore = action === 'BLOCK' ? Math.floor(70 + Math.random() * 30)
    : action === 'REVIEW' ? Math.floor(40 + Math.random() * 30)
    : Math.floor(Math.random() * 40);

  const event = {
    decisionId: `dec-${Date.now()}`,
    merchantId: randomItem(MERCHANTS),
    entityId: `dev-${Math.random().toString(36).slice(2, 10)}`,
    action,
    riskScore,
    timestamp: new Date().toISOString(),
    topRiskFactors: action !== 'ALLOW'
      ? [randomItem(RISK_FACTORS), randomItem(RISK_FACTORS)].filter((v, i, a) => a.indexOf(v) === i)
      : [],
  };

  io.emit('decision', event);
}, 2000);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export { app };

const PORT = parseInt(process.env.PORT ?? '3000', 10);

if (require.main === module) {
  httpServer.listen(PORT, () => {
    console.log(`SignalRisk mock server running on port ${PORT}`);
  });
}
