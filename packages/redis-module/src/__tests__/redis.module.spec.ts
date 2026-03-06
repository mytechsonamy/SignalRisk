import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisModule } from '../redis.module';
import { REDIS_CLIENT } from '../redis.constants';
import { Redis } from 'ioredis';

// Mock ioredis
const mockOn = jest.fn();
const mockQuit = jest.fn().mockResolvedValue('OK');
jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({ on: mockOn, quit: mockQuit }))
}));

describe('RedisModule', () => {
  it('provides REDIS_CLIENT token', async () => {
    const module = await Test.createTestingModule({
      imports: [RedisModule.forRoot({ host: 'localhost', port: 6379 })],
    }).overrideProvider(ConfigService).useValue({ get: jest.fn((key: string, def: any) => def) }).compile();

    const client = module.get(REDIS_CLIENT);
    expect(client).toBeDefined();
  });

  it('forRoot returns a DynamicModule', () => {
    const mod = RedisModule.forRoot();
    expect(mod.module).toBe(RedisModule);
    expect(mod.global).toBe(true);
    expect(mod.providers).toHaveLength(1);
    expect(mod.exports).toContain(REDIS_CLIENT);
  });

  it('uses ConfigService defaults when no explicit config', async () => {
    const mockConfigService = { get: jest.fn((key: string, def: any) => def) };
    const module = await Test.createTestingModule({
      imports: [RedisModule.forRoot()],
    }).overrideProvider(ConfigService).useValue(mockConfigService).compile();

    module.get(REDIS_CLIENT);
    // ConfigService.get should have been called for REDIS_HOST
    expect(mockConfigService.get).toHaveBeenCalledWith('REDIS_HOST', 'localhost');
  });

  it('uses explicit config over ConfigService when provided', async () => {
    const RedisMock = require('ioredis').Redis;
    RedisMock.mockClear();
    const module = await Test.createTestingModule({
      imports: [RedisModule.forRoot({ host: 'custom-host', port: 6380 })],
    }).overrideProvider(ConfigService).useValue({ get: jest.fn((k: string, d: any) => d) }).compile();

    module.get(REDIS_CLIENT);
    expect(RedisMock).toHaveBeenCalledWith(expect.objectContaining({ host: 'custom-host', port: 6380 }));
  });

  it('REDIS_CLIENT constant is the string REDIS_CLIENT', () => {
    expect(REDIS_CLIENT).toBe('REDIS_CLIENT');
  });

  it('module is marked @Global', () => {
    const mod = RedisModule.forRoot();
    expect(mod.global).toBe(true);
  });

  it('exports contain REDIS_CLIENT', () => {
    const mod = RedisModule.forRoot();
    expect(mod.exports).toContain(REDIS_CLIENT);
  });

  it('provider uses factory function', () => {
    const mod = RedisModule.forRoot();
    const provider = mod.providers?.[0] as any;
    expect(typeof provider.useFactory).toBe('function');
  });
});
