/**
 * SignalRisk Event Collector — Events Controller
 *
 * POST /v1/events — accepts arrays of events with API key validation
 * and comprehensive backpressure control (queue depth, per-merchant
 * fairness, dynamic rate adjustment via BackpressureGuard).
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
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiHeader } from '@nestjs/swagger';
import { EventsService, IngestResult } from './events.service';
import { ApiKeyService } from './api-key.service';
import { CreateEventDto } from './dto/create-event.dto';
import { BackpressureGuard } from '../backpressure/backpressure.guard';

@ApiTags('events')
@Controller('v1/events')
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  @ApiOperation({ summary: 'Ingest one or more fraud detection events' })
  @ApiHeader({ name: 'Authorization', description: 'Bearer <api-key> or ApiKey <api-key>', required: true })
  @ApiResponse({ status: 202, description: 'Events accepted for processing' })
  @ApiResponse({ status: 400, description: 'Empty events array or invalid schema' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Authorization header' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded — see Retry-After header' })
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(BackpressureGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async ingestEvents(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: { events: CreateEventDto[] },
  ): Promise<{ status: string; accepted: number; rejected: number; results: IngestResult['results'] }> {
    // --- API Key validation ---
    this.validateApiKey(authHeader);

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
   * Extracts and validates the API key from the Authorization header.
   * Expected format: `Bearer <api-key>` or `ApiKey <api-key>`.
   * Delegates key lookup and format enforcement to ApiKeyService.
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

    // Delegate format validation and key-store lookup to ApiKeyService.
    // Throws UnauthorizedException on format mismatch or unknown key.
    this.apiKeyService.validate(apiKey);
  }
}
