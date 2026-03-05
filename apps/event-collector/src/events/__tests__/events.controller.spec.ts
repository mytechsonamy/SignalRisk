import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { EventsController } from '../events.controller';
import { EventsService, IngestResult } from '../events.service';
import { KafkaService } from '../../kafka/kafka.service';
import { EventType } from '../dto/create-event.dto';

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

describe('EventsController', () => {
  let controller: EventsController;
  let eventsService: EventsService;
  let kafkaService: KafkaService;

  const mockIngestResult: IngestResult = {
    accepted: 2,
    rejected: 0,
    results: [
      { eventId: 'evt-1', accepted: true },
      { eventId: 'evt-2', accepted: true },
    ],
  };

  const validEvents = [
    {
      merchantId: 'merchant-001',
      deviceId: 'device-abc',
      sessionId: 'session-xyz',
      type: EventType.PAGE_VIEW,
      payload: { page: '/home' },
    },
    {
      merchantId: 'merchant-001',
      deviceId: 'device-abc',
      sessionId: 'session-xyz',
      type: EventType.CLICK,
      payload: { element: '#buy-btn' },
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: EventsService,
          useValue: {
            ingest: jest.fn().mockResolvedValue(mockIngestResult),
          },
        },
        {
          provide: KafkaService,
          useValue: {
            getConsumerLag: jest.fn().mockReturnValue(0),
            isConnected: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, any> = {
                'backpressure.maxConsumerLag': 100_000,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
    eventsService = module.get<EventsService>(EventsService);
    kafkaService = module.get<KafkaService>(KafkaService);
  });

  describe('POST /v1/events', () => {
    it('should return 202 Accepted for valid events', async () => {
      const result = await controller.ingestEvents('Bearer test-api-key', {
        events: validEvents,
      });

      expect(result.status).toBe('accepted');
      expect(result.accepted).toBe(2);
      expect(result.rejected).toBe(0);
      expect(eventsService.ingest).toHaveBeenCalledWith(validEvents);
    });

    it('should throw 401 when Authorization header is missing', async () => {
      await expect(
        controller.ingestEvents(undefined, { events: validEvents }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.UNAUTHORIZED,
        }),
      );
    });

    it('should throw 401 for invalid Authorization format', async () => {
      await expect(
        controller.ingestEvents('invalid-header', { events: validEvents }),
      ).rejects.toThrow(HttpException);
    });

    it('should throw 401 for unsupported auth scheme', async () => {
      await expect(
        controller.ingestEvents('Basic abc123', { events: validEvents }),
      ).rejects.toThrow(HttpException);
    });

    it('should accept ApiKey scheme', async () => {
      const result = await controller.ingestEvents('ApiKey my-api-key', {
        events: validEvents,
      });

      expect(result.status).toBe('accepted');
    });

    it('should throw 400 when events array is empty', async () => {
      await expect(
        controller.ingestEvents('Bearer test-key', { events: [] }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
        }),
      );
    });

    it('should throw 429 when consumer lag exceeds threshold', async () => {
      jest.spyOn(kafkaService, 'getConsumerLag').mockReturnValue(200_000);

      await expect(
        controller.ingestEvents('Bearer test-key', { events: validEvents }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
        }),
      );
    });

    it('should not trigger backpressure when lag is below threshold', async () => {
      jest.spyOn(kafkaService, 'getConsumerLag').mockReturnValue(50_000);

      const result = await controller.ingestEvents('Bearer test-key', {
        events: validEvents,
      });

      expect(result.status).toBe('accepted');
    });
  });
});
