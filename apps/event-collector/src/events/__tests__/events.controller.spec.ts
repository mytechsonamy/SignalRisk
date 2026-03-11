import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { EventsController } from '../events.controller';
import { EventsService, IngestResult } from '../events.service';
import { ApiKeyService } from '../api-key.service';
import { EventType } from '../dto/create-event.dto';
import { BackpressureGuard } from '../../backpressure/backpressure.guard';

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
          provide: ApiKeyService,
          useValue: {
            validate: jest.fn(), // no-op: accept any key in tests
          },
        },
      ],
    })
      .overrideGuard(BackpressureGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EventsController>(EventsController);
    eventsService = module.get<EventsService>(EventsService);
  });

  describe('POST /v1/events', () => {
    it('should return 202 Accepted for valid events', async () => {
      const result = await controller.ingestEvents('Bearer test-api-key', undefined, {
        events: validEvents,
      });

      expect(result.status).toBe('accepted');
      expect(result.accepted).toBe(2);
      expect(result.rejected).toBe(0);
      expect(eventsService.ingest).toHaveBeenCalledWith(validEvents, false);
    });

    it('should throw 401 when Authorization header is missing', async () => {
      await expect(
        controller.ingestEvents(undefined, undefined, { events: validEvents }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.UNAUTHORIZED,
        }),
      );
    });

    it('should throw 401 for invalid Authorization format', async () => {
      await expect(
        controller.ingestEvents('invalid-header', undefined, { events: validEvents }),
      ).rejects.toThrow(HttpException);
    });

    it('should throw 401 for unsupported auth scheme', async () => {
      await expect(
        controller.ingestEvents('Basic abc123', undefined, { events: validEvents }),
      ).rejects.toThrow(HttpException);
    });

    it('should accept ApiKey scheme', async () => {
      const result = await controller.ingestEvents('ApiKey my-api-key', undefined, {
        events: validEvents,
      });

      expect(result.status).toBe('accepted');
    });

    it('should throw 400 when events array is empty', async () => {
      await expect(
        controller.ingestEvents('Bearer test-key', undefined, { events: [] }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.BAD_REQUEST,
        }),
      );
    });

    // NOTE: Backpressure 429 enforcement is now handled by BackpressureGuard
    // and tested in backpressure.guard.spec.ts. The controller delegates
    // all backpressure decisions to the guard via @UseGuards(BackpressureGuard).
    it('should accept request when BackpressureGuard allows', async () => {
      const result = await controller.ingestEvents('Bearer test-key', undefined, {
        events: validEvents,
      });

      expect(result.status).toBe('accepted');
    });
  });
});
