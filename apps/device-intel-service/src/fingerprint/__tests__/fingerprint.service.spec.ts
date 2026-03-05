import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FingerprintService } from '../fingerprint.service';
import { DeviceCacheService } from '../../cache/device-cache.service';
import { TrustScoreService } from '../trust-score.service';
import { DeviceAttributes, Device } from '../interfaces/device-attributes.interface';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCacheService = {
  getByFingerprint: jest.fn(),
  getById: jest.fn(),
  setDevice: jest.fn(),
  invalidate: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      database: {
        host: 'localhost',
        port: 5432,
        username: 'test',
        password: 'test',
        database: 'test',
        ssl: false,
      },
      'fingerprint.fuzzyMatchThreshold': 0.85,
    };
    return config[key];
  }),
};

const mockTrustScoreService = {
  calculateTrustScore: jest.fn().mockReturnValue(75),
  calculateInitialTrustScore: jest.fn().mockReturnValue(50),
  applyInactivityDecay: jest.fn().mockReturnValue(70),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAttrs(overrides?: Partial<DeviceAttributes>): DeviceAttributes {
  return {
    screenResolution: '1920x1080',
    gpuRenderer: 'ANGLE (NVIDIA GeForce GTX 1080)',
    timezone: 'Africa/Johannesburg',
    language: 'en-ZA',
    webglHash: 'abc123def456',
    canvasHash: 'canvas789xyz',
    platform: 'web',
    ...overrides,
  };
}

function makeDevice(overrides?: Partial<Device>): Device {
  return {
    id: 'device-001',
    merchantId: 'merchant-001',
    fingerprint: 'a'.repeat(64),
    fingerprintPrefix: 'a'.repeat(8),
    trustScore: 50,
    isEmulator: false,
    attributes: makeAttrs(),
    firstSeenAt: new Date('2026-01-01'),
    lastSeenAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FingerprintService', () => {
  let service: FingerprintService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FingerprintService,
        { provide: DeviceCacheService, useValue: mockCacheService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: TrustScoreService, useValue: mockTrustScoreService },
      ],
    }).compile();

    service = module.get<FingerprintService>(FingerprintService);
  });

  // -------------------------------------------------------------------------
  // generateFingerprint
  // -------------------------------------------------------------------------

  describe('generateFingerprint', () => {
    it('should produce a deterministic SHA-256 hex string', () => {
      const attrs = makeAttrs();
      const fp1 = service.generateFingerprint(attrs);
      const fp2 = service.generateFingerprint(attrs);

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64); // SHA-256 hex = 64 chars
      expect(fp1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce different fingerprints for different stable attributes', () => {
      const fp1 = service.generateFingerprint(makeAttrs());
      const fp2 = service.generateFingerprint(
        makeAttrs({ screenResolution: '2560x1440' }),
      );

      expect(fp1).not.toBe(fp2);
    });

    it('should ignore non-stable attributes (language, fonts, etc.)', () => {
      const fp1 = service.generateFingerprint(makeAttrs({ language: 'en-US' }));
      const fp2 = service.generateFingerprint(makeAttrs({ language: 'af-ZA' }));

      expect(fp1).toBe(fp2);
    });

    it('should produce different fingerprints when GPU changes', () => {
      const fp1 = service.generateFingerprint(makeAttrs());
      const fp2 = service.generateFingerprint(
        makeAttrs({ gpuRenderer: 'Intel HD 630' }),
      );

      expect(fp1).not.toBe(fp2);
    });

    it('should produce different fingerprints when timezone changes', () => {
      const fp1 = service.generateFingerprint(makeAttrs());
      const fp2 = service.generateFingerprint(
        makeAttrs({ timezone: 'Europe/London' }),
      );

      expect(fp1).not.toBe(fp2);
    });

    it('should produce different fingerprints when webglHash changes', () => {
      const fp1 = service.generateFingerprint(makeAttrs());
      const fp2 = service.generateFingerprint(
        makeAttrs({ webglHash: 'different_hash' }),
      );

      expect(fp1).not.toBe(fp2);
    });

    it('should produce different fingerprints when canvasHash changes', () => {
      const fp1 = service.generateFingerprint(makeAttrs());
      const fp2 = service.generateFingerprint(
        makeAttrs({ canvasHash: 'different_canvas' }),
      );

      expect(fp1).not.toBe(fp2);
    });
  });

  // -------------------------------------------------------------------------
  // similarity
  // -------------------------------------------------------------------------

  describe('similarity', () => {
    it('should return 1.0 for identical strings', () => {
      expect(service.similarity('abcdef', 'abcdef')).toBe(1.0);
    });

    it('should return 0.0 for empty strings', () => {
      expect(service.similarity('', 'abc')).toBe(0.0);
      expect(service.similarity('abc', '')).toBe(0.0);
    });

    it('should return a value between 0 and 1 for similar strings', () => {
      const sim = service.similarity('abcdef123456', 'abcdef789012');
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });

    it('should return higher similarity for more similar strings', () => {
      const highSim = service.similarity('abcdef123456', 'abcdef123457');
      const lowSim = service.similarity('abcdef123456', 'zyxwvu987654');
      expect(highSim).toBeGreaterThan(lowSim);
    });

    it('should return 1.0 for identical fingerprints', () => {
      const fp = 'a'.repeat(64);
      expect(service.similarity(fp, fp)).toBe(1.0);
    });
  });

  // -------------------------------------------------------------------------
  // fuzzyMatch — cache scenarios
  // -------------------------------------------------------------------------

  describe('fuzzyMatch', () => {
    it('should return cached device on cache hit', async () => {
      const device = makeDevice();
      mockCacheService.getByFingerprint.mockResolvedValue(device);

      const result = await service.fuzzyMatch('somefingerprint', 'merchant-001');

      expect(result).toBe(device);
      expect(mockCacheService.getByFingerprint).toHaveBeenCalledWith(
        'merchant-001',
        'somefingerprint',
      );
    });

    it('should return null on cache miss when no DB match', async () => {
      mockCacheService.getByFingerprint.mockResolvedValue(null);

      // Mock the pool.connect to return a client that finds nothing
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service['pool'] as any).connect = jest.fn().mockResolvedValue(mockClient);

      const result = await service.fuzzyMatch('nonexistent', 'merchant-001');
      expect(result).toBeNull();
    });
  });

  // NOTE: Emulator detection tests have been moved to emulator-detector.spec.ts
  // since the logic now lives in EmulatorDetector (no longer a private method
  // on FingerprintService).
});

