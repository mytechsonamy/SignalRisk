import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

// Import mock data (avoid MSW ESM issues)
const mockCases = [
  {
    id: 'case-001',
    merchantId: 'merchant-001',
    entityId: 'device-abc123',
    action: 'REVIEW',
    riskScore: 72,
    status: 'OPEN',
    priority: 'HIGH',
    slaDeadline: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'case-002',
    merchantId: 'merchant-001',
    entityId: 'device-def456',
    action: 'BLOCK',
    riskScore: 95,
    status: 'OPEN',
    priority: 'HIGH',
    slaDeadline: new Date(Date.now() + 14400000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Auth routes
app.post('/v1/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (email && password) {
    res.json({ accessToken: 'mock-jwt-token', refreshToken: 'mock-refresh-token', expiresIn: 86400 });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.post('/v1/auth/logout', (_req: Request, res: Response) => {
  res.status(204).send();
});

app.post('/v1/auth/refresh', (_req: Request, res: Response) => {
  res.json({ accessToken: 'mock-jwt-refreshed', expiresIn: 86400 });
});

// Cases routes
app.get('/v1/cases', (req: Request, res: Response) => {
  const { status, priority, page = '1' } = req.query;
  let cases = [...mockCases];
  if (status) cases = cases.filter(c => c.status === status);
  if (priority) cases = cases.filter(c => c.priority === priority);
  res.json({ cases, total: cases.length, page: parseInt(page as string), pageSize: 20 });
});

app.get('/v1/cases/export', (_req: Request, res: Response) => {
  res.json(mockCases);
});

app.get('/v1/cases/:id', (req: Request, res: Response) => {
  const c = mockCases.find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ message: 'Not found' });
  res.json({ ...c, evidenceTimeline: [], riskFactors: ['device_emulator', 'high_velocity'] });
});

app.patch('/v1/cases/:id', (_req: Request, res: Response) => {
  res.json({ success: true });
});

app.post('/v1/cases/bulk', (_req: Request, res: Response) => {
  res.json({ updated: 2 });
});

// Chargebacks
app.post('/v1/chargebacks', (_req: Request, res: Response) => {
  res.status(204).send();
});

// Analytics
app.get('/v1/analytics/risk-scores', (_req: Request, res: Response) => {
  res.json({ histogram: [{ range: '0-20', count: 10 }, { range: '80-100', count: 5 }] });
});
app.get('/v1/analytics/decisions', (_req: Request, res: Response) => {
  res.json({ donut: [{ action: 'ALLOW', count: 80 }, { action: 'BLOCK', count: 15 }, { action: 'REVIEW', count: 5 }] });
});
app.get('/v1/analytics/trends', (_req: Request, res: Response) => {
  res.json({ trends: [] });
});

// Feature flags
app.get('/v1/flags/:name/check', (_req: Request, res: Response) => {
  res.json({ enabled: false });
});

// Merchants
app.get('/v1/merchants/:id', (req: Request, res: Response) => {
  res.json({ id: req.params.id, name: 'Test Merchant', email: 'test@merchant.com' });
});

// Events
app.post('/v1/events', (_req: Request, res: Response) => {
  res.status(201).json({ eventId: `evt-${Date.now()}`, status: 'accepted' });
});

// Decisions
app.get('/v1/decisions', (_req: Request, res: Response) => {
  res.json({ decisions: [], total: 0, page: 1, pageSize: 20 });
});

// Graph Intel
app.post('/graph-intel/analyze', (_req: Request, res: Response) => {
  res.json({ riskScore: 10, connectedFraudCount: 0, sharedDeviceCount: 1, sharedIpCount: 1, fraudRingDetected: false });
});

// Kafka lag metrics
app.get('/metrics/kafka-lag', (_req: Request, res: Response) => {
  res.type('text/plain').send('# HELP kafka_consumer_lag Consumer group lag\n# TYPE kafka_consumer_lag gauge\nkafka_consumer_lag{group="fraud-processors",topic="fraud-events",partition="0"} 0\n');
});

// Network Intel
app.post('/network-intel/analyze', (_req: Request, res: Response) => {
  res.json({ riskScore: 15, ipRiskScore: 10, botScore: 5, isDatacenter: false, isTor: false, isProxy: false });
});

// Telco Intel
app.post('/telco-intel/analyze', (_req: Request, res: Response) => {
  res.json({ riskScore: 5, isVoip: false, isDisposable: false, isBurner: false, countryMismatch: false });
});

// Health
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Route not found' });
});

export { app };

const PORT = parseInt(process.env.PORT ?? '5174', 10);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SignalRisk E2E mock server running on port ${PORT}`);
  });
}
