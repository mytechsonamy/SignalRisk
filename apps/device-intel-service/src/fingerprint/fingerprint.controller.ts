/**
 * SignalRisk Device Intel — Fingerprint Controller
 *
 * REST endpoints for device identification, lookup, and history.
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { FingerprintService } from './fingerprint.service';
import { IdentifyDeviceDto } from './dto/identify-device.dto';

@Controller('v1/devices')
export class FingerprintController {
  private readonly logger = new Logger(FingerprintController.name);

  constructor(private readonly fingerprintService: FingerprintService) {}

  /**
   * POST /v1/devices/identify
   *
   * Accept device attributes, generate fingerprint, match or register
   * the device, and return device_id + trust_score + is_new.
   */
  @Post('identify')
  @HttpCode(HttpStatus.OK)
  async identify(@Body() dto: IdentifyDeviceDto) {
    const attrs = {
      screenResolution: dto.screenResolution,
      gpuRenderer: dto.gpuRenderer,
      timezone: dto.timezone,
      language: dto.language,
      fonts: dto.fonts,
      webglHash: dto.webglHash,
      canvasHash: dto.canvasHash,
      audioHash: dto.audioHash,
      androidId: dto.androidId,
      playIntegrityToken: dto.playIntegrityToken,
      sensorNoise: dto.sensorNoise,
      platform: dto.platform,
    };

    const result = await this.fingerprintService.identify(dto.merchantId, attrs);

    this.logger.log(
      `Identified device ${result.deviceId} for merchant ${dto.merchantId} ` +
        `(new=${result.isNew}, trust=${result.trustScore})`,
    );

    return {
      deviceId: result.deviceId,
      fingerprint: result.fingerprint,
      trustScore: result.trustScore,
      isNew: result.isNew,
      isEmulator: result.isEmulator,
    };
  }

  /**
   * GET /v1/devices/:id
   *
   * Get device details by ID. Requires merchantId as query param.
   */
  @Get(':id')
  async getDevice(
    @Param('id') deviceId: string,
    @Query('merchantId') merchantId: string,
  ) {
    const device = await this.fingerprintService.getDeviceById(deviceId, merchantId);

    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    return {
      id: device.id,
      merchantId: device.merchantId,
      fingerprint: device.fingerprint,
      trustScore: device.trustScore,
      isEmulator: device.isEmulator,
      attributes: device.attributes,
      firstSeenAt: device.firstSeenAt.toISOString(),
      lastSeenAt: device.lastSeenAt.toISOString(),
    };
  }

  /**
   * GET /v1/devices/:id/history
   *
   * Get device event history. Requires merchantId as query param.
   */
  @Get(':id/history')
  async getDeviceHistory(
    @Param('id') deviceId: string,
    @Query('merchantId') merchantId: string,
    @Query('limit') limit?: string,
  ) {
    // Verify device exists
    const device = await this.fingerprintService.getDeviceById(deviceId, merchantId);
    if (!device) {
      throw new NotFoundException(`Device ${deviceId} not found`);
    }

    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 200) : 50;
    const events = await this.fingerprintService.getDeviceHistory(
      deviceId,
      merchantId,
      parsedLimit,
    );

    return {
      deviceId,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        payload: e.payload,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }
}
