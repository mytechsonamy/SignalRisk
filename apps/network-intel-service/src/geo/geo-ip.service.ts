/**
 * SignalRisk Network Intel — GeoIP Service
 *
 * MaxMind GeoIP2-lite in-memory IP lookup using the maxmind npm package.
 * Loads GeoLite2-City database at startup via onModuleInit().
 * Gracefully degrades when the DB file is not present.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as maxmind from 'maxmind';
import type { CityResponse, Reader } from 'maxmind';

export interface GeoResult {
  country: string | undefined;
  city: string | undefined;
  latitude: number | undefined;
  longitude: number | undefined;
  asn: string | undefined;
}

@Injectable()
export class GeoIpService implements OnModuleInit {
  private readonly logger = new Logger(GeoIpService.name);
  private reader: Reader<CityResponse> | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const dbPath = this.configService.get<string>('geoDbPath') ?? 'data/GeoLite2-City.mmdb';

    if (!fs.existsSync(dbPath)) {
      this.logger.warn(
        `GeoIP database not found at path: ${dbPath}. ` +
          'IP geolocation will be unavailable. ' +
          'Set GEO_DB_PATH to a valid GeoLite2-City.mmdb file.',
      );
      return;
    }

    try {
      this.reader = await maxmind.open<CityResponse>(dbPath);
      this.logger.log(`GeoIP database loaded from ${dbPath}`);
    } catch (err) {
      this.logger.warn(`Failed to load GeoIP database from ${dbPath}: ${(err as Error).message}`);
    }
  }

  /**
   * Look up geolocation for an IP address.
   * Returns null when the database is unavailable or the IP is not found.
   */
  lookup(ip: string): GeoResult | null {
    if (!this.reader) {
      return null;
    }

    try {
      const result = this.reader.get(ip);
      if (!result) {
        return null;
      }

      return {
        country: result.country?.iso_code,
        city: result.city?.names?.en,
        latitude: result.location?.latitude,
        longitude: result.location?.longitude,
        // GeoLite2-City doesn't include ASN; that would require GeoLite2-ASN.
        // We include the field for interface compatibility and populate from traits if available.
        asn: (result as Record<string, unknown> & { traits?: { autonomous_system_number?: number } })
          .traits?.autonomous_system_number?.toString(),
      };
    } catch (err) {
      this.logger.warn(`GeoIP lookup failed for IP ${ip}: ${(err as Error).message}`);
      return null;
    }
  }
}
