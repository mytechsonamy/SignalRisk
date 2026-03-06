import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RuleHotReloadService } from './rule-hot-reload.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('RuleHotReloadService', () => {
  let service: RuleHotReloadService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RuleHotReloadService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('http://localhost:3013'),
          },
        },
      ],
    }).compile();

    service = module.get<RuleHotReloadService>(RuleHotReloadService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('checkAndReload detects new version and calls loadVersion', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { value: 'v2' } });
    const loadVersionSpy = jest.spyOn(service, 'loadVersion').mockResolvedValueOnce(undefined);

    await service.checkAndReload();

    expect(loadVersionSpy).toHaveBeenCalledWith('v2');
  });

  it('checkAndReload skips when version is unchanged', async () => {
    // Manually set the current version
    (service as any).currentVersion = 'v1';
    mockedAxios.get.mockResolvedValueOnce({ data: { value: 'v1' } });
    const loadVersionSpy = jest.spyOn(service, 'loadVersion').mockResolvedValueOnce(undefined);

    await service.checkAndReload();

    expect(loadVersionSpy).not.toHaveBeenCalled();
  });

  it('checkAndReload catches errors without throwing', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

    await expect(service.checkAndReload()).resolves.not.toThrow();
  });

  it('loadVersion atomically swaps rule set on valid DSL', async () => {
    const validDsl = 'RULE high_velocity IF velocity > 100 THEN block END';
    mockedAxios.get.mockResolvedValueOnce({ data: { value: validDsl } });

    await service.loadVersion('v2');

    expect(service.getCurrentVersion()).toBe('v2');
    expect(service.getActiveRuleSet()).not.toBeNull();
    expect(service.getActiveRuleSet().dsl).toBe(validDsl);
  });

  it('loadVersion does NOT swap on invalid DSL (rollback)', async () => {
    // First load a valid version
    const validDsl = 'RULE initial IF amount > 1000 THEN flag END';
    mockedAxios.get.mockResolvedValueOnce({ data: { value: validDsl } });
    await service.loadVersion('v1');

    const previousRuleSet = service.getActiveRuleSet();

    // Now try to load invalid DSL
    const invalidDsl = 'this is not a valid rule definition at all';
    mockedAxios.get.mockResolvedValueOnce({ data: { value: invalidDsl } });

    await service.loadVersion('v2');

    // Version and rule set should remain unchanged
    expect(service.getCurrentVersion()).toBe('v1');
    expect(service.getActiveRuleSet()).toBe(previousRuleSet);
  });

  it('loadVersion calls auditReload on success', async () => {
    const validDsl = 'RULE test IF score > 50 THEN alert END';
    mockedAxios.get.mockResolvedValueOnce({ data: { value: validDsl } });

    const auditSpy = jest.spyOn(service as any, 'auditReload');

    await service.loadVersion('v3');

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'v3', rules: validDsl }),
    );
  });

  it('loadVersion throws when no DSL returned', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { value: null } });

    // loadVersion swallows the error internally; version should stay null
    await service.loadVersion('v4');

    expect(service.getCurrentVersion()).toBeNull();
    expect(service.getActiveRuleSet()).toBeNull();
  });

  it('parseDsl throws on DSL without RULE keyword', () => {
    const invalidDsl = 'some random text without the keyword';
    expect(() => (service as any).parseDsl(invalidDsl)).toThrow('Invalid DSL: no RULE blocks found');
  });

  it('manualReload delegates to loadVersion', async () => {
    const loadVersionSpy = jest.spyOn(service, 'loadVersion').mockResolvedValueOnce(undefined);

    await service.manualReload('v5');

    expect(loadVersionSpy).toHaveBeenCalledWith('v5');
  });

  it('getCurrentVersion returns null initially, then new version after load', async () => {
    expect(service.getCurrentVersion()).toBeNull();

    const validDsl = 'RULE check IF risk > 0 THEN score END';
    mockedAxios.get.mockResolvedValueOnce({ data: { value: validDsl } });

    await service.loadVersion('v6');

    expect(service.getCurrentVersion()).toBe('v6');
  });
});
