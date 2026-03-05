import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import * as request from 'supertest';
import { MerchantController } from '../merchant.controller';
import { MerchantService } from '../merchant.service';
import { AdminGuard } from '../guards/admin.guard';

const mockMerchant = {
  id: 'uuid-1234',
  name: 'Test Merchant',
  apiKeyPrefix: 'sk_test_',
  webhookUrl: undefined,
  rateLimitPerMinute: 1000,
  tier: 'default',
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  deletedAt: undefined,
};

describe('MerchantController', () => {
  let app: INestApplication;
  let merchantService: jest.Mocked<MerchantService>;

  // Helper to build test modules; pass overrideGuard=false to test 401 paths
  async function buildApp(overrideGuard = true): Promise<INestApplication> {
    const mockService: jest.Mocked<Partial<MerchantService>> = {
      createMerchant: jest.fn(),
      getMerchant: jest.fn(),
      updateMerchant: jest.fn(),
      deleteMerchant: jest.fn(),
      rotateApiKey: jest.fn(),
    };

    const builder = Test.createTestingModule({
      controllers: [MerchantController],
      providers: [{ provide: MerchantService, useValue: mockService }],
    });

    if (overrideGuard) {
      builder.overrideGuard(AdminGuard).useValue({ canActivate: () => true });
    } else {
      // Guard throws 401 for every request
      builder.overrideGuard(AdminGuard).useValue({
        canActivate: () => {
          const { UnauthorizedException } = require('@nestjs/common');
          throw new UnauthorizedException('Admin JWT required');
        },
      });
    }

    const module: TestingModule = await builder.compile();
    const a = module.createNestApplication();
    await a.init();
    merchantService = module.get(MerchantService) as jest.Mocked<MerchantService>;
    return a;
  }

  afterEach(async () => {
    await app?.close();
  });

  // ---- POST /v1/merchants ---------------------------------------------------

  describe('POST /v1/merchants', () => {
    it('should create a merchant and return 201', async () => {
      app = await buildApp();
      const created = { ...mockMerchant, apiKey: 'sk_test_abc123' };
      merchantService.createMerchant.mockResolvedValue(created as any);

      const res = await request(app.getHttpServer())
        .post('/v1/merchants')
        .send({ name: 'Test Merchant' })
        .expect(201);

      expect(res.body.name).toBe('Test Merchant');
      expect(res.body.apiKey).toBe('sk_test_abc123');
    });

    it('should pass dto fields to service', async () => {
      app = await buildApp();
      const created = { ...mockMerchant, apiKey: 'sk_test_newkey', tier: 'burst' };
      merchantService.createMerchant.mockResolvedValue(created as any);

      await request(app.getHttpServer())
        .post('/v1/merchants')
        .send({ name: 'Burst Merchant', tier: 'burst', rateLimitPerMinute: 5000 })
        .expect(201);

      expect(merchantService.createMerchant).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Burst Merchant', tier: 'burst' }),
      );
    });

    it('should return 401 without admin JWT', async () => {
      app = await buildApp(false);

      await request(app.getHttpServer())
        .post('/v1/merchants')
        .send({ name: 'Test' })
        .expect(401);
    });
  });

  // ---- GET /v1/merchants/:id ------------------------------------------------

  describe('GET /v1/merchants/:id', () => {
    it('should return a merchant by id', async () => {
      app = await buildApp();
      merchantService.getMerchant.mockResolvedValue(mockMerchant as any);

      const res = await request(app.getHttpServer())
        .get('/v1/merchants/uuid-1234')
        .expect(200);

      expect(res.body.id).toBe('uuid-1234');
      expect(res.body.apiKeyHash).toBeUndefined();
    });

    it('should return 404 for unknown merchant', async () => {
      app = await buildApp();
      merchantService.getMerchant.mockRejectedValue(
        new NotFoundException('Not found'),
      );

      await request(app.getHttpServer())
        .get('/v1/merchants/unknown-id')
        .expect(404);
    });

    it('should return 401 without admin JWT', async () => {
      app = await buildApp(false);

      await request(app.getHttpServer())
        .get('/v1/merchants/uuid-1234')
        .expect(401);
    });
  });

  // ---- PATCH /v1/merchants/:id ----------------------------------------------

  describe('PATCH /v1/merchants/:id', () => {
    it('should update a merchant', async () => {
      app = await buildApp();
      const updated = { ...mockMerchant, name: 'Updated Name' };
      merchantService.updateMerchant.mockResolvedValue(updated as any);

      const res = await request(app.getHttpServer())
        .patch('/v1/merchants/uuid-1234')
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body.name).toBe('Updated Name');
    });

    it('should return 404 for unknown merchant', async () => {
      app = await buildApp();
      merchantService.updateMerchant.mockRejectedValue(
        new NotFoundException('Not found'),
      );

      await request(app.getHttpServer())
        .patch('/v1/merchants/unknown-id')
        .send({ name: 'x' })
        .expect(404);
    });

    it('should return 401 without admin JWT', async () => {
      app = await buildApp(false);

      await request(app.getHttpServer())
        .patch('/v1/merchants/uuid-1234')
        .send({ name: 'x' })
        .expect(401);
    });
  });

  // ---- DELETE /v1/merchants/:id --------------------------------------------

  describe('DELETE /v1/merchants/:id', () => {
    it('should return 204 on successful delete', async () => {
      app = await buildApp();
      merchantService.deleteMerchant.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete('/v1/merchants/uuid-1234')
        .expect(204);

      expect(merchantService.deleteMerchant).toHaveBeenCalledWith('uuid-1234');
    });

    it('should return 404 for unknown merchant', async () => {
      app = await buildApp();
      merchantService.deleteMerchant.mockRejectedValue(
        new NotFoundException('Not found'),
      );

      await request(app.getHttpServer())
        .delete('/v1/merchants/unknown-id')
        .expect(404);
    });

    it('should return 401 without admin JWT', async () => {
      app = await buildApp(false);

      await request(app.getHttpServer())
        .delete('/v1/merchants/uuid-1234')
        .expect(401);
    });
  });

  // ---- POST /v1/merchants/:id/rotate-key ------------------------------------

  describe('POST /v1/merchants/:id/rotate-key', () => {
    it('should return new apiKey and prefix with 200', async () => {
      app = await buildApp();
      merchantService.rotateApiKey.mockResolvedValue({
        apiKey: 'sk_test_newrotatedkey1234',
        prefix: 'sk_test_',
      });

      const res = await request(app.getHttpServer())
        .post('/v1/merchants/uuid-1234/rotate-key')
        .expect(200);

      expect(res.body.apiKey).toBe('sk_test_newrotatedkey1234');
      expect(res.body.prefix).toBe('sk_test_');
    });

    it('should return 404 for unknown merchant', async () => {
      app = await buildApp();
      merchantService.rotateApiKey.mockRejectedValue(
        new NotFoundException('Not found'),
      );

      await request(app.getHttpServer())
        .post('/v1/merchants/unknown-id/rotate-key')
        .expect(404);
    });

    it('should return 401 without admin JWT', async () => {
      app = await buildApp(false);

      await request(app.getHttpServer())
        .post('/v1/merchants/uuid-1234/rotate-key')
        .expect(401);
    });
  });
});
