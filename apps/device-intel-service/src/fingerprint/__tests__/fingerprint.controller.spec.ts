import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FingerprintController } from '../fingerprint.controller';
import { FingerprintService } from '../fingerprint.service';
import { IdentifyDeviceDto } from '../dto/identify-device.dto';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFingerprintService = {
  identify: jest.fn(),
  getDeviceById: jest.fn(),
  getDeviceHistory: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FingerprintController', () => {
  let controller: FingerprintController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FingerprintController],
      providers: [
        { provide: FingerprintService, useValue: mockFingerprintService },
      ],
    }).compile();

    controller = module.get<FingerprintController>(FingerprintController);
  });

  // -------------------------------------------------------------------------
  // POST /v1/devices/identify
  // -------------------------------------------------------------------------

  describe('identify', () => {
    it('should return device identification result', async () => {
      const dto: IdentifyDeviceDto = {
        merchantId: 'merchant-001',
        screenResolution: '1920x1080',
        gpuRenderer: 'NVIDIA GeForce GTX 1080',
        timezone: 'Africa/Johannesburg',
        language: 'en-ZA',
        webglHash: 'abc123',
        canvasHash: 'canvas789',
        platform: 'web',
      };

      mockFingerprintService.identify.mockResolvedValue({
        deviceId: 'device-001',
        fingerprint: 'a'.repeat(64),
        trustScore: 50,
        isNew: true,
        isEmulator: false,
      });

      const result = await controller.identify(dto);

      expect(result).toEqual({
        deviceId: 'device-001',
        fingerprint: 'a'.repeat(64),
        trustScore: 50,
        isNew: true,
        isEmulator: false,
      });

      expect(mockFingerprintService.identify).toHaveBeenCalledWith(
        'merchant-001',
        expect.objectContaining({
          screenResolution: '1920x1080',
          platform: 'web',
        }),
      );
    });

    it('should return existing device when not new', async () => {
      const dto: IdentifyDeviceDto = {
        merchantId: 'merchant-001',
        screenResolution: '1920x1080',
        gpuRenderer: 'NVIDIA GeForce GTX 1080',
        timezone: 'Africa/Johannesburg',
        language: 'en-ZA',
        webglHash: 'abc123',
        canvasHash: 'canvas789',
        platform: 'web',
      };

      mockFingerprintService.identify.mockResolvedValue({
        deviceId: 'device-002',
        fingerprint: 'b'.repeat(64),
        trustScore: 75,
        isNew: false,
        isEmulator: false,
      });

      const result = await controller.identify(dto);

      expect(result.isNew).toBe(false);
      expect(result.trustScore).toBe(75);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/devices/:id
  // -------------------------------------------------------------------------

  describe('getDevice', () => {
    it('should return device details', async () => {
      mockFingerprintService.getDeviceById.mockResolvedValue({
        id: 'device-001',
        merchantId: 'merchant-001',
        fingerprint: 'a'.repeat(64),
        trustScore: 50,
        isEmulator: false,
        attributes: { screenResolution: '1920x1080', platform: 'web' },
        firstSeenAt: new Date('2026-01-01T00:00:00Z'),
        lastSeenAt: new Date('2026-03-01T00:00:00Z'),
      });

      const result = await controller.getDevice('device-001', 'merchant-001');

      expect(result.id).toBe('device-001');
      expect(result.trustScore).toBe(50);
    });

    it('should throw NotFoundException when device not found', async () => {
      mockFingerprintService.getDeviceById.mockResolvedValue(null);

      await expect(
        controller.getDevice('nonexistent', 'merchant-001'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/devices/:id/history
  // -------------------------------------------------------------------------

  describe('getDeviceHistory', () => {
    it('should return device event history', async () => {
      mockFingerprintService.getDeviceById.mockResolvedValue({
        id: 'device-001',
        merchantId: 'merchant-001',
      });

      mockFingerprintService.getDeviceHistory.mockResolvedValue([
        {
          id: 'evt-001',
          type: 'PAGE_VIEW',
          payload: { url: '/checkout' },
          createdAt: new Date('2026-03-01T10:00:00Z'),
        },
      ]);

      const result = await controller.getDeviceHistory(
        'device-001',
        'merchant-001',
      );

      expect(result.deviceId).toBe('device-001');
      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('PAGE_VIEW');
    });

    it('should throw NotFoundException when device not found', async () => {
      mockFingerprintService.getDeviceById.mockResolvedValue(null);

      await expect(
        controller.getDeviceHistory('nonexistent', 'merchant-001'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should cap limit at 200', async () => {
      mockFingerprintService.getDeviceById.mockResolvedValue({
        id: 'device-001',
        merchantId: 'merchant-001',
      });
      mockFingerprintService.getDeviceHistory.mockResolvedValue([]);

      await controller.getDeviceHistory('device-001', 'merchant-001', '500');

      expect(mockFingerprintService.getDeviceHistory).toHaveBeenCalledWith(
        'device-001',
        'merchant-001',
        200,
      );
    });
  });
});
