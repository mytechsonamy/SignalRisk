/**
 * SignalRisk Device Intel — Fingerprint Service
 *
 * Generates stable device fingerprints from client-collected attributes,
 * performs exact and fuzzy matching against known devices, and manages
 * the device lifecycle (create / update / lookup).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Pool } from 'pg';
import {
  DeviceAttributes,
  Device,
  IdentifyResult,
} from './interfaces/device-attributes.interface';
import { DeviceCacheService } from '../cache/device-cache.service';
import { EmulatorDetector } from './emulator-detector';
import { TrustScoreService } from './trust-score.service';

@Injectable()
export class FingerprintService {
  private readonly logger = new Logger(FingerprintService.name);
  private readonly pool: Pool;
  private readonly fuzzyThreshold: number;
  private readonly emulatorDetector: EmulatorDetector;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: DeviceCacheService,
    private readonly trustScoreService: TrustScoreService,
  ) {
    const dbConfig = this.configService.get('database');
    this.pool = new Pool({
      host: dbConfig?.host || 'localhost',
      port: dbConfig?.port || 5432,
      user: dbConfig?.username || 'signalrisk',
      password: dbConfig?.password || 'signalrisk',
      database: dbConfig?.database || 'signalrisk',
      ssl: dbConfig?.ssl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    this.fuzzyThreshold = this.configService.get<number>('fingerprint.fuzzyMatchThreshold') ?? 0.85;
    this.emulatorDetector = new EmulatorDetector();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Generate a SHA-256 fingerprint from stable device attributes.
   * Only uses attributes that remain consistent across sessions:
   * screenResolution, gpuRenderer, timezone, webglHash, canvasHash.
   */
  generateFingerprint(attrs: DeviceAttributes): string {
    const stableInput = [
      attrs.screenResolution,
      attrs.gpuRenderer,
      attrs.timezone,
      attrs.webglHash,
      attrs.canvasHash,
    ].join('|');

    return createHash('sha256').update(stableInput).digest('hex');
  }

  /**
   * Try to find a matching device for the given fingerprint and merchant.
   * 1. Exact match via Redis cache
   * 2. Exact match via DB (populate cache on hit)
   * 3. Fuzzy match via fingerprint_prefix (first 8 chars)
   */
  async fuzzyMatch(fingerprint: string, merchantId: string): Promise<Device | null> {
    // 1. Exact match — Redis cache
    const cached = await this.cacheService.getByFingerprint(merchantId, fingerprint);
    if (cached) {
      this.logger.debug(`Cache hit for fingerprint ${fingerprint.substring(0, 8)}...`);
      return cached;
    }

    // 2. Exact match — DB
    const exactDevice = await this.findByExactFingerprint(merchantId, fingerprint);
    if (exactDevice) {
      await this.cacheService.setDevice(merchantId, exactDevice);
      return exactDevice;
    }

    // 3. Fuzzy match — prefix lookup then similarity comparison
    const prefix = fingerprint.substring(0, 8);
    const candidates = await this.findByFingerprintPrefix(merchantId, prefix);

    let bestMatch: Device | null = null;
    let bestSimilarity = 0;

    for (const candidate of candidates) {
      const sim = this.similarity(fingerprint, candidate.fingerprint);
      if (sim > bestSimilarity && sim >= this.fuzzyThreshold) {
        bestSimilarity = sim;
        bestMatch = candidate;
      }
    }

    if (bestMatch) {
      this.logger.debug(
        `Fuzzy match found: similarity=${bestSimilarity.toFixed(3)} ` +
          `for device ${bestMatch.id}`,
      );
      await this.cacheService.setDevice(merchantId, bestMatch);
    }

    return bestMatch;
  }

  /**
   * Compute similarity between two hex fingerprint strings.
   * Uses character-level Jaccard similarity on bigrams for robustness.
   */
  similarity(fp1: string, fp2: string): number {
    if (fp1 === fp2) return 1.0;
    if (!fp1 || !fp2) return 0.0;

    const bigrams1 = this.toBigrams(fp1);
    const bigrams2 = this.toBigrams(fp2);

    const set1 = new Set(bigrams1);
    const set2 = new Set(bigrams2);

    let intersection = 0;
    for (const bg of set1) {
      if (set2.has(bg)) intersection++;
    }

    const union = set1.size + set2.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Create or update a device record. Returns the persisted device.
   * For new devices, calculates an initial trust score from attributes.
   * For existing devices (ON CONFLICT path), updates attributes and emulator
   * status but preserves the trust_score already in the DB (managed by
   * updateDeviceLastSeen / inactivity decay).
   */
  async registerDevice(
    merchantId: string,
    fingerprint: string,
    attrs: DeviceAttributes,
  ): Promise<Device> {
    const prefix = fingerprint.substring(0, 8);
    const emulatorAnalysis = this.emulatorDetector.detect(attrs);
    const { isEmulator } = emulatorAnalysis;

    // Calculate initial trust score for brand-new devices
    const initialTrustScore = this.trustScoreService.calculateInitialTrustScore(
      attrs,
      emulatorAnalysis,
    );

    const client = await this.pool.connect();
    try {
      // SET LOCAL for tenant isolation (RLS) — use set_config to avoid SQL injection
      await client.query("SELECT set_config('app.merchant_id', $1, true)", [merchantId]);

      const result = await client.query(
        `INSERT INTO devices (merchant_id, fingerprint, fingerprint_prefix, trust_score, is_emulator, attributes, first_seen_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (merchant_id, fingerprint)
         DO UPDATE SET
           attributes = $6,
           is_emulator = $5,
           last_seen_at = NOW()
         RETURNING id, merchant_id, fingerprint, fingerprint_prefix, trust_score, is_emulator, attributes, first_seen_at, last_seen_at`,
        [merchantId, fingerprint, prefix, initialTrustScore, isEmulator, JSON.stringify(attrs)],
      );

      const row = result.rows[0];
      const device = this.rowToDevice(row);

      // Update cache
      await this.cacheService.setDevice(merchantId, device);

      this.logger.log(
        `Registered device ${device.id} for merchant ${merchantId} ` +
          `(emulator=${isEmulator}, trustScore=${device.trustScore}, ` +
          `emulatorConfidence=${emulatorAnalysis.confidence})`,
      );

      return device;
    } finally {
      client.release();
    }
  }

  /**
   * Full identify flow: generate fingerprint, match or register, return result.
   * For returning devices, recalculates trust score based on full context.
   */
  async identify(merchantId: string, attrs: DeviceAttributes): Promise<IdentifyResult> {
    const fingerprint = this.generateFingerprint(attrs);

    // Try exact or fuzzy match
    const existingDevice = await this.fuzzyMatch(fingerprint, merchantId);

    if (existingDevice) {
      const emulatorAnalysis = this.emulatorDetector.detect(attrs);
      const now = new Date();
      const daysSinceFirstSeen = Math.floor(
        (now.getTime() - existingDevice.firstSeenAt.getTime()) / 86_400_000,
      );
      const daysSinceLastSeen = Math.floor(
        (now.getTime() - existingDevice.lastSeenAt.getTime()) / 86_400_000,
      );

      const newTrustScore = this.trustScoreService.calculateTrustScore({
        device: existingDevice,
        currentAttrs: attrs,
        emulatorAnalysis,
        daysSinceFirstSeen,
        daysSinceLastSeen,
      });

      // Update last_seen_at, attributes, and recalculated trust score
      await this.updateDeviceLastSeen(existingDevice.id, merchantId, attrs, newTrustScore);

      return {
        deviceId: existingDevice.id,
        fingerprint: existingDevice.fingerprint,
        trustScore: newTrustScore,
        isNew: false,
        isEmulator: emulatorAnalysis.isEmulator,
      };
    }

    // New device — register
    const device = await this.registerDevice(merchantId, fingerprint, attrs);
    return {
      deviceId: device.id,
      fingerprint: device.fingerprint,
      trustScore: device.trustScore,
      isNew: true,
      isEmulator: device.isEmulator,
    };
  }

  /**
   * Get device by ID.
   */
  async getDeviceById(deviceId: string, merchantId: string): Promise<Device | null> {
    // Check cache first
    const cached = await this.cacheService.getById(merchantId, deviceId);
    if (cached) return cached;

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, merchant_id, fingerprint, fingerprint_prefix, trust_score, is_emulator, attributes, first_seen_at, last_seen_at
         FROM devices
         WHERE id = $1 AND merchant_id = $2`,
        [deviceId, merchantId],
      );

      if (result.rows.length === 0) return null;

      const device = this.rowToDevice(result.rows[0]);
      await this.cacheService.setDevice(merchantId, device);
      return device;
    } finally {
      client.release();
    }
  }

  /**
   * Get device event history (recent events associated with this device).
   */
  async getDeviceHistory(
    deviceId: string,
    merchantId: string,
    limit = 50,
  ): Promise<Array<{ id: string; type: string; payload: Record<string, unknown>; createdAt: Date }>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, type, payload, created_at
         FROM events
         WHERE device_id = $1 AND merchant_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [deviceId, merchantId, limit],
      );

      return result.rows.map((row) => ({
        id: row.id,
        type: row.type,
        payload: row.payload,
        createdAt: row.created_at,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Get the underlying connection pool (used by health checks).
   */
  getPool(): Pool {
    return this.pool;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async findByExactFingerprint(merchantId: string, fingerprint: string): Promise<Device | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, merchant_id, fingerprint, fingerprint_prefix, trust_score, is_emulator, attributes, first_seen_at, last_seen_at
         FROM devices
         WHERE merchant_id = $1 AND fingerprint = $2`,
        [merchantId, fingerprint],
      );

      return result.rows.length > 0 ? this.rowToDevice(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  private async findByFingerprintPrefix(merchantId: string, prefix: string): Promise<Device[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, merchant_id, fingerprint, fingerprint_prefix, trust_score, is_emulator, attributes, first_seen_at, last_seen_at
         FROM devices
         WHERE merchant_id = $1 AND fingerprint_prefix = $2`,
        [merchantId, prefix],
      );

      return result.rows.map((row) => this.rowToDevice(row));
    } finally {
      client.release();
    }
  }

  private async updateDeviceLastSeen(
    deviceId: string,
    merchantId: string,
    attrs: DeviceAttributes,
    trustScore: number,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE devices SET last_seen_at = NOW(), attributes = $3, trust_score = $4
         WHERE id = $1 AND merchant_id = $2`,
        [deviceId, merchantId, JSON.stringify(attrs), trustScore],
      );

      // Invalidate cache so next read gets fresh data
      await this.cacheService.invalidate(merchantId, deviceId);
    } finally {
      client.release();
    }
  }

  private toBigrams(str: string): string[] {
    const bigrams: string[] = [];
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.push(str.substring(i, i + 2));
    }
    return bigrams;
  }

  private rowToDevice(row: Record<string, unknown>): Device {
    return {
      id: row.id as string,
      merchantId: row.merchant_id as string,
      fingerprint: row.fingerprint as string,
      fingerprintPrefix: row.fingerprint_prefix as string,
      trustScore: parseFloat(String(row.trust_score)),
      isEmulator: row.is_emulator as boolean,
      attributes: (typeof row.attributes === 'string'
        ? JSON.parse(row.attributes)
        : row.attributes) as DeviceAttributes,
      firstSeenAt: new Date(row.first_seen_at as string),
      lastSeenAt: new Date(row.last_seen_at as string),
    };
  }
}
