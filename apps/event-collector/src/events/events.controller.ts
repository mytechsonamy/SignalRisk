/**
 * SignalRisk Event Collector — Events Controller
 *
 * POST /v1/events — accepts arrays of events with API key validation,
 * per-merchant rate limiting, and Kafka backpressure (429 on high lag).
 */

import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  HttpException,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventsService, IngestResult } from './events.service';
import { KafkaService } from '../kafka/kafka.service';
import { CreateEventDto } from './dto/create-event.dto';

@Controller('v1/events')
export class EventsController {
  private readonly logger = new Logger(EventsController.name);
  private readonly maxConsumerLag: number;

  constructor(
    private readonly eventsService: EventsService,
    private readonly kafkaService: KafkaService,
    private readonly configService: ConfigService,
  ) {
    this.maxConsumerLag = this.configService.get<number>('backpressure.maxConsumerLag') || 100_000;
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async ingestEvents(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: { events: CreateEventDto[] },
  ): Promise<{ status: string; accepted: number; rejected: number; results: IngestResult['results'] }> {
    // --- API Key validation ---
    this.validateApiKey(authHeader);

    // --- Backpressure check ---
    const lag = this.kafkaService.getConsumerLag();
    if (lag > this.maxConsumerLag) {
      this.logger.warn(
        `Backpressure triggered: consumer lag ${lag} exceeds threshold ${this.maxConsumerLag}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Service under backpressure. Please retry later.',
          consumerLag: lag,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // --- Validate events array ---
    const events = body.events;
    if (!Array.isArray(events) || events.length === 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Request body must contain a non-empty "events" array.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // --- Ingest ---
    const result = await this.eventsService.ingest(events);

    return {
      status: 'accepted',
      accepted: result.accepted,
      rejected: result.rejected,
      results: result.results,
    };
  }

  /**
   * Validates the API key from the Authorization header.
   * Expected format: `Bearer <api-key>` or `ApiKey <api-key>`.
   */
  private validateApiKey(authHeader: string | undefined): void {
    if (!authHeader) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Missing Authorization header.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Invalid Authorization header format. Expected "Bearer <key>" or "ApiKey <key>".',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const [scheme, apiKey] = parts;
    if (!['Bearer', 'ApiKey'].includes(scheme)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Invalid Authorization scheme. Expected "Bearer" or "ApiKey".',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!apiKey || apiKey.trim().length === 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'API key is empty.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // In production, this would validate against a merchant API key store.
    // For now, we accept any non-empty key to allow integration testing.
    // TODO: Integrate with auth-service for real key validation.
  }
}
