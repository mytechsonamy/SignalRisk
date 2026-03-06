import { http, HttpResponse } from 'msw';
import { mockCases, mockDecisions } from './mock-data';

// Re-export for convenience
export { mockCases, mockDecisions } from './mock-data';

// ─── MSW v2 Handlers ─────────────────────────────────────────────────────────

export const handlers = [
  // Auth routes
  http.post('/v1/auth/login', () =>
    HttpResponse.json({ accessToken: 'mock-jwt', refreshToken: 'mock-refresh' }),
  ),
  http.post('/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
  http.post('/v1/auth/refresh', () =>
    HttpResponse.json({ accessToken: 'mock-jwt-refreshed', refreshToken: 'mock-refresh-new' }),
  ),

  // Cases routes
  http.get('/v1/cases', () =>
    HttpResponse.json({ cases: mockCases, total: 2, page: 1, limit: 20 }),
  ),
  http.get('/v1/cases/:id', ({ params }) => {
    const found = mockCases.find((c) => c.id === params['id']);
    return HttpResponse.json(found ?? mockCases[0]);
  }),
  http.patch('/v1/cases/:id', () => HttpResponse.json({ success: true })),
  http.post('/v1/cases/bulk', () => HttpResponse.json({ updated: 2 })),

  // Chargebacks
  http.post('/v1/chargebacks', () => new HttpResponse(null, { status: 204 })),

  // Analytics routes
  http.get('/v1/analytics/risk-scores', () =>
    HttpResponse.json({
      histogram: [
        { range: '0-10', count: 120 },
        { range: '10-20', count: 95 },
        { range: '20-30', count: 78 },
        { range: '80-90', count: 42 },
        { range: '90-100', count: 23 },
      ],
    }),
  ),
  http.get('/v1/analytics/decisions', () =>
    HttpResponse.json({
      donut: [
        { action: 'ALLOW', count: 850 },
        { action: 'REVIEW', count: 120 },
        { action: 'BLOCK', count: 30 },
      ],
    }),
  ),
  http.get('/v1/analytics/trends', () =>
    HttpResponse.json({
      trends: [
        { date: '2026-02-28', allow: 800, review: 100, block: 25 },
        { date: '2026-03-01', allow: 820, review: 110, block: 28 },
        { date: '2026-03-02', allow: 790, review: 95, block: 22 },
        { date: '2026-03-03', allow: 850, review: 120, block: 30 },
      ],
    }),
  ),

  // Feature flags
  http.get('/v1/flags/:name/check', () => HttpResponse.json({ enabled: false })),

  // Health
  http.get('/health', () => HttpResponse.json({ status: 'ok' })),
];
