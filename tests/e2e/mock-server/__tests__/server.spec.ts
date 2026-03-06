import request from 'supertest';
import { app } from '../server';

describe('E2E Mock Server', () => {
  describe('Auth routes', () => {
    it('POST /v1/auth/login with valid credentials returns 200 + accessToken', async () => {
      const res = await request(app).post('/v1/auth/login')
        .send({ email: 'test@test.com', password: 'password' });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it('POST /v1/auth/login with missing credentials returns 401', async () => {
      const res = await request(app).post('/v1/auth/login').send({});
      expect(res.status).toBe(401);
    });

    it('POST /v1/auth/logout returns 204', async () => {
      const res = await request(app).post('/v1/auth/logout');
      expect(res.status).toBe(204);
    });

    it('POST /v1/auth/refresh returns new accessToken', async () => {
      const res = await request(app).post('/v1/auth/refresh').send({ refreshToken: 'mock' });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
    });
  });

  describe('Cases routes', () => {
    it('GET /v1/cases returns cases array and total', async () => {
      const res = await request(app).get('/v1/cases');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.cases)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
    });

    it('GET /v1/cases?status=OPEN filters correctly', async () => {
      const res = await request(app).get('/v1/cases?status=OPEN');
      expect(res.status).toBe(200);
      res.body.cases.forEach((c: any) => expect(c.status).toBe('OPEN'));
    });

    it('GET /v1/cases/:id returns case detail with evidenceTimeline', async () => {
      const res = await request(app).get('/v1/cases/case-001');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('case-001');
      expect(res.body.evidenceTimeline).toBeDefined();
    });

    it('GET /v1/cases/:id returns 404 for unknown id', async () => {
      const res = await request(app).get('/v1/cases/nonexistent');
      expect(res.status).toBe(404);
    });

    it('PATCH /v1/cases/:id returns success', async () => {
      const res = await request(app).patch('/v1/cases/case-001').send({ status: 'RESOLVED' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /v1/cases/bulk returns updated count', async () => {
      const res = await request(app).post('/v1/cases/bulk').send({ ids: ['case-001', 'case-002'], action: 'RESOLVE' });
      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(2);
    });
  });

  describe('Other routes', () => {
    it('POST /v1/chargebacks returns 204', async () => {
      const res = await request(app).post('/v1/chargebacks').send({});
      expect(res.status).toBe(204);
    });

    it('GET /v1/analytics/risk-scores returns histogram', async () => {
      const res = await request(app).get('/v1/analytics/risk-scores');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.histogram)).toBe(true);
    });

    it('GET /v1/flags/:name/check returns enabled flag', async () => {
      const res = await request(app).get('/v1/flags/test-flag/check');
      expect(res.status).toBe(200);
      expect(res.body.enabled).toBeDefined();
    });

    it('GET /health returns ok status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('Unknown route returns 404', async () => {
      const res = await request(app).get('/unknown/route');
      expect(res.status).toBe(404);
    });
  });
});
