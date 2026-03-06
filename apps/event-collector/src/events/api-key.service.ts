/**
 * ApiKeyService — validates SDK API keys for the event-collector.
 *
 * Expected format: sk_test_<32 lowercase hex chars>
 * Keys are configured via ALLOWED_API_KEYS env var (comma-separated).
 * If ALLOWED_API_KEYS is not set, format-only validation runs (dev/test mode).
 */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const API_KEY_REGEX = /^sk_test_[0-9a-f]{32}$/;

/** Lookup prefix length: 'sk_test_' (8) + first 8 hex chars = 16 */
const PREFIX_LEN = 16;

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  /**
   * Maps the 16-char lookup prefix to the SHA-256 hash of the full key.
   * Empty when ALLOWED_API_KEYS is not configured (format-only mode).
   */
  private readonly keyHashes = new Map<string, string>();

  constructor(private readonly configService: ConfigService) {
    this.loadKeys();
  }

  private loadKeys(): void {
    const raw = this.configService.get<string>('ALLOWED_API_KEYS', '');
    if (!raw.trim()) {
      this.logger.warn(
        'ALLOWED_API_KEYS is not configured — API key format validation only. ' +
          'Set ALLOWED_API_KEYS=<key1>,<key2> for production.',
      );
      return;
    }

    let loaded = 0;
    for (const key of raw.split(',').map((k) => k.trim()).filter(Boolean)) {
      if (!API_KEY_REGEX.test(key)) {
        this.logger.warn(
          'Ignoring malformed key in ALLOWED_API_KEYS ' +
            '(must match sk_test_[0-9a-f]{32})',
        );
        continue;
      }
      const prefix = key.slice(0, PREFIX_LEN);
      const hash = crypto.createHash('sha256').update(key).digest('hex');
      this.keyHashes.set(prefix, hash);
      loaded++;
    }

    this.logger.log(`Loaded ${loaded} API key(s) from ALLOWED_API_KEYS`);
  }

  /**
   * Validates an API key. Throws UnauthorizedException on any failure.
   *
   * Steps:
   * 1. Assert format matches sk_test_[0-9a-f]{32}
   * 2. If keys are configured, look up the prefix and compare hashes with
   *    a constant-time comparison to prevent timing attacks.
   */
  validate(apiKey: string): void {
    // Dev bypass: skip all validation when ENABLE_API_KEY_VALIDATION is explicitly 'false'
    if (process.env.ENABLE_API_KEY_VALIDATION === 'false') {
      this.logger.warn('API key validation disabled via ENABLE_API_KEY_VALIDATION=false');
      return;
    }

    if (!API_KEY_REGEX.test(apiKey)) {
      throw new UnauthorizedException(
        'Invalid API key format. Expected: sk_test_<32 hex chars>',
      );
    }

    // No keys configured → format-valid keys are accepted (dev/test mode)
    if (this.keyHashes.size === 0) {
      this.logger.debug(
        'No ALLOWED_API_KEYS — accepting format-valid key in dev mode',
      );
      return;
    }

    const prefix = apiKey.slice(0, PREFIX_LEN);
    const storedHash = this.keyHashes.get(prefix);
    if (!storedHash) {
      throw new UnauthorizedException('Unknown API key');
    }

    const providedHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Constant-time comparison to mitigate timing side-channels
    const storedBuf = Buffer.from(storedHash, 'hex');
    const providedBuf = Buffer.from(providedHash, 'hex');
    if (
      storedBuf.length !== providedBuf.length ||
      !crypto.timingSafeEqual(storedBuf, providedBuf)
    ) {
      throw new UnauthorizedException('Invalid API key');
    }
  }
}
