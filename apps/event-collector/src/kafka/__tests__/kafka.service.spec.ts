import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KafkaService } from '../kafka.service';

// Mock KafkaJS
const mockProducerConnect = jest.fn().mockResolvedValue(undefined);
const mockProducerDisconnect = jest.fn().mockResolvedValue(undefined);
const mockProducerSend = jest.fn().mockResolvedValue([
  { topicName: 'test-topic', partition: 0, errorCode: 0, offset: '1', timestamp: '-1' },
]);
const mockProducerOn = jest.fn();

const mockAdminConnect = jest.fn().mockResolvedValue(undefined);
const mockAdminDisconnect = jest.fn().mockResolvedValue(undefined);
const mockFetchTopicOffsets = jest.fn().mockResolvedValue([
  { partition: 0, offset: '100', high: '100', low: '0' },
]);
const mockFetchOffsets = jest.fn().mockResolvedValue([
  {
    topic: 'signalrisk.events.raw',
    partitions: [{ partition: 0, offset: '90' }],
  },
]);

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    producer: jest.fn().mockReturnValue({
      connect: mockProducerConnect,
      disconnect: mockProducerDisconnect,
      send: mockProducerSend,
      on: mockProducerOn,
    }),
    admin: jest.fn().mockReturnValue({
      connect: mockAdminConnect,
      disconnect: mockAdminDisconnect,
      fetchTopicOffsets: mockFetchTopicOffsets,
      fetchOffsets: mockFetchOffsets,
    }),
  })),
  CompressionTypes: {
    None: 0,
    GZIP: 1,
    Snappy: 2,
    LZ4: 3,
    ZSTD: 4,
  },
  logLevel: {
    NOTHING: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 4,
    DEBUG: 5,
  },
}));

// Silence OpenTelemetry in tests
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startActiveSpan: (_name: string, fn: (span: any) => any) =>
        fn({
          setAttribute: jest.fn(),
          setStatus: jest.fn(),
          end: jest.fn(),
        }),
    }),
  },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

describe('KafkaService', () => {
  let service: KafkaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, any> = {
                'kafka.brokers': ['localhost:9092'],
                'kafka.clientId': 'test-event-collector',
                'kafka.ssl': false,
                'kafka.saslMechanism': undefined,
                'kafka.compression': 'none',
                'backpressure.lagCheckIntervalMs': 60_000, // Long interval so polling doesn't interfere
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<KafkaService>(KafkaService);
  });

  describe('connect', () => {
    it('should connect the producer and admin client', async () => {
      await service.connect();

      expect(mockProducerConnect).toHaveBeenCalledTimes(1);
      expect(mockAdminConnect).toHaveBeenCalledTimes(1);
      expect(service.isConnected()).toBe(true);
    });

    it('should throw if producer connection fails', async () => {
      mockProducerConnect.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(service.connect()).rejects.toThrow('Connection refused');
      expect(service.isConnected()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect the producer and admin client', async () => {
      await service.connect();
      await service.disconnect();

      expect(mockProducerDisconnect).toHaveBeenCalledTimes(1);
      expect(mockAdminDisconnect).toHaveBeenCalledTimes(1);
      expect(service.isConnected()).toBe(false);
    });
  });

  describe('send', () => {
    it('should send a single message', async () => {
      await service.connect();

      const result = await service.send({
        topic: 'test-topic',
        key: 'merchant-1:session-1',
        value: JSON.stringify({ foo: 'bar' }),
        headers: { 'event-id': 'evt-1' },
      });

      expect(mockProducerSend).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it('should throw when not connected', async () => {
      await expect(
        service.send({
          topic: 'test-topic',
          key: 'key',
          value: 'value',
        }),
      ).rejects.toThrow('Kafka producer is not connected');
    });
  });

  describe('sendBatch', () => {
    it('should batch messages by topic', async () => {
      await service.connect();

      await service.sendBatch([
        { topic: 'topic-a', key: 'k1', value: 'v1' },
        { topic: 'topic-a', key: 'k2', value: 'v2' },
        { topic: 'topic-b', key: 'k3', value: 'v3' },
      ]);

      // Should send 2 batches: one for topic-a (2 messages), one for topic-b (1 message)
      expect(mockProducerSend).toHaveBeenCalledTimes(2);

      const firstCall = mockProducerSend.mock.calls[0][0];
      expect(firstCall.topic).toBe('topic-a');
      expect(firstCall.messages).toHaveLength(2);

      const secondCall = mockProducerSend.mock.calls[1][0];
      expect(secondCall.topic).toBe('topic-b');
      expect(secondCall.messages).toHaveLength(1);
    });

    it('should throw when a topic batch send fails', async () => {
      await service.connect();
      mockProducerSend.mockRejectedValueOnce(new Error('Send failed'));

      await expect(
        service.sendBatch([{ topic: 'test', key: 'k', value: 'v' }]),
      ).rejects.toThrow('Send failed');
    });
  });

  describe('getConsumerLag', () => {
    it('should return 0 initially', () => {
      expect(service.getConsumerLag()).toBe(0);
    });
  });

  describe('isConnected', () => {
    it('should return false before connect()', () => {
      expect(service.isConnected()).toBe(false);
    });

    it('should return true after connect()', async () => {
      await service.connect();
      expect(service.isConnected()).toBe(true);
    });
  });
});
