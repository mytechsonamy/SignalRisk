import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DeviceSignalConsumerService } from '../device-signal-consumer.service';
import { GraphIntelService } from '../../graph/graph-intel.service';

// Mock kafkajs so no real connections are made
jest.mock('kafkajs', () => {
  const mockConsumer = {
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
  return {
    Kafka: jest.fn().mockImplementation(() => ({
      consumer: jest.fn().mockReturnValue(mockConsumer),
    })),
  };
});

describe('DeviceSignalConsumerService', () => {
  let service: DeviceSignalConsumerService;
  let graphIntelService: jest.Mocked<GraphIntelService>;

  beforeEach(async () => {
    const mockGraphIntelService = {
      upsertDevice: jest.fn().mockResolvedValue(undefined),
      linkDeviceToSession: jest.fn().mockResolvedValue(undefined),
      detectDeviceSharing: jest.fn(),
      detectVelocityRing: jest.fn(),
      getDeviceNeighbors: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue({
        brokers: ['localhost:9092'],
        clientId: 'graph-intel-service',
        groupId: 'graph-intel-service',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceSignalConsumerService,
        {
          provide: GraphIntelService,
          useValue: mockGraphIntelService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DeviceSignalConsumerService>(DeviceSignalConsumerService);
    graphIntelService = module.get(GraphIntelService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleMessage (via private access)', () => {
    const buildPayload = (data: Record<string, unknown>) => ({
      topic: 'device-signals',
      partition: 0,
      message: {
        value: Buffer.from(JSON.stringify(data)),
        offset: '0',
        key: null,
        timestamp: '0',
        attributes: 0,
        headers: {},
      },
    });

    it('should call upsertDevice when message contains device data', async () => {
      const payload = buildPayload({
        deviceId: 'device-1',
        merchantId: 'merchant-1',
        fingerprint: 'fp-abc',
        trustScore: 80,
        isEmulator: false,
        firstSeenAt: '2024-01-01T00:00:00.000Z',
      });

      // Access private method for testing
      await (service as unknown as { handleMessage: (p: unknown) => Promise<void> }).handleMessage(payload);

      expect(graphIntelService.upsertDevice).toHaveBeenCalledTimes(1);
      expect(graphIntelService.upsertDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'device-1',
          merchantId: 'merchant-1',
          trustScore: 80,
        }),
      );
    });

    it('should call both upsertDevice and linkDeviceToSession when sessionId is present', async () => {
      const payload = buildPayload({
        deviceId: 'device-1',
        merchantId: 'merchant-1',
        fingerprint: 'fp-abc',
        trustScore: 70,
        isEmulator: false,
        firstSeenAt: '2024-01-01T00:00:00.000Z',
        sessionId: 'session-42',
        riskScore: 0.3,
        isBot: false,
      });

      await (service as unknown as { handleMessage: (p: unknown) => Promise<void> }).handleMessage(payload);

      expect(graphIntelService.upsertDevice).toHaveBeenCalledTimes(1);
      expect(graphIntelService.linkDeviceToSession).toHaveBeenCalledTimes(1);
      expect(graphIntelService.linkDeviceToSession).toHaveBeenCalledWith(
        'device-1',
        'session-42',
        expect.objectContaining({
          sessionId: 'session-42',
          merchantId: 'merchant-1',
        }),
      );
    });

    it('should NOT call linkDeviceToSession when no sessionId present', async () => {
      const payload = buildPayload({
        deviceId: 'device-1',
        merchantId: 'merchant-1',
        fingerprint: 'fp-abc',
        trustScore: 70,
        isEmulator: false,
        firstSeenAt: '2024-01-01T00:00:00.000Z',
      });

      await (service as unknown as { handleMessage: (p: unknown) => Promise<void> }).handleMessage(payload);

      expect(graphIntelService.upsertDevice).toHaveBeenCalledTimes(1);
      expect(graphIntelService.linkDeviceToSession).not.toHaveBeenCalled();
    });

    it('should log error and not throw when upsertDevice fails', async () => {
      graphIntelService.upsertDevice.mockRejectedValueOnce(new Error('Neo4j connection failed'));

      const payload = buildPayload({
        deviceId: 'device-1',
        merchantId: 'merchant-1',
        fingerprint: 'fp-abc',
        trustScore: 70,
        isEmulator: false,
        firstSeenAt: '2024-01-01T00:00:00.000Z',
      });

      // Should not throw
      await expect(
        (service as unknown as { handleMessage: (p: unknown) => Promise<void> }).handleMessage(payload),
      ).resolves.toBeUndefined();
    });

    it('should skip message with null value', async () => {
      const payload = {
        topic: 'device-signals',
        partition: 0,
        message: { value: null, offset: '0', key: null, timestamp: '0', attributes: 0, headers: {} },
      };

      await (service as unknown as { handleMessage: (p: unknown) => Promise<void> }).handleMessage(payload);

      expect(graphIntelService.upsertDevice).not.toHaveBeenCalled();
    });
  });
});
