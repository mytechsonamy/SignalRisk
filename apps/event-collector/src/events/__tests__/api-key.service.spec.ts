/**
 * Unit tests for ApiKeyService
 *
 * The service validates SDK API keys with format: sk_test_<32 lowercase hex chars>
 * In production mode (ALLOWED_API_KEYS set), keys are looked up by 16-char prefix
 * and verified using SHA-256 with constant-time comparison.
 * In dev mode (ALLOWED_API_KEYS not set), format-valid keys are accepted.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ApiKeyService } from '../api-key.service';

// Helper: produce a valid-format key from a given 32 hex chars body
function makeKey(hexChars: string): string {
  return `sk_test_${hexChars}`;
}

// A known-valid key used across production-mode tests
const VALID_KEY = makeKey('a1b2c3d4e5f6789012345678901234ab');
const VALID_KEY_HASH = crypto.createHash('sha256').update(VALID_KEY).digest('hex');
const VALID_KEY_PREFIX = VALID_KEY.slice(0, 16); // 'sk_test_a1b2c3d4'

// A second key whose prefix differs from VALID_KEY — for "prefix not in store" test
const UNKNOWN_KEY = makeKey('ffffffffffffffffffffffffffffffff');

// A key sharing the same prefix as VALID_KEY but with different trailing chars
const WRONG_KEY = makeKey('a1b2c3d4ffffffffffffffffffffffff');

describe('ApiKeyService', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Snapshot the env so we can restore it after each test
    originalEnv = { ...process.env };
    // Ensure the dev-bypass flag is not set by default
    delete process.env.ENABLE_API_KEY_VALIDATION;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ---------------------------------------------------------------------------
  // Helpers to instantiate the service with a specific ALLOWED_API_KEYS value
  // ---------------------------------------------------------------------------

  async function createService(allowedApiKeys?: string): Promise<ApiKeyService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue = '') => {
              if (key === 'ALLOWED_API_KEYS') {
                return allowedApiKeys ?? defaultValue;
              }
              return defaultValue;
            },
          },
        },
      ],
    }).compile();

    return module.get<ApiKeyService>(ApiKeyService);
  }

  // ---------------------------------------------------------------------------
  // 1. Valid key (correct format + in ALLOWED_API_KEYS) → accepted (no exception)
  // ---------------------------------------------------------------------------

  it('should accept a valid key that matches format and is in ALLOWED_API_KEYS', async () => {
    const service = await createService(VALID_KEY);
    expect(() => service.validate(VALID_KEY)).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // 2. Invalid format: too short → rejected
  // ---------------------------------------------------------------------------

  it('should reject a key that is too short', async () => {
    const service = await createService(VALID_KEY);
    expect(() => service.validate('sk_test_abc123')).toThrow(UnauthorizedException);
  });

  // ---------------------------------------------------------------------------
  // 3. Invalid format: wrong prefix (not sk_test_) → rejected
  // ---------------------------------------------------------------------------

  it('should reject a key with the wrong prefix', async () => {
    const service = await createService(VALID_KEY);
    const wrongPrefixKey = 'sk_prod_a1b2c3d4e5f6789012345678901234ab';
    expect(() => service.validate(wrongPrefixKey)).toThrow(UnauthorizedException);
  });

  // ---------------------------------------------------------------------------
  // 4. Invalid format: uppercase hex characters → rejected (regex enforces lowercase)
  // ---------------------------------------------------------------------------

  it('should reject a key with uppercase hex characters', async () => {
    const service = await createService(VALID_KEY);
    // Replace lowercase hex with uppercase in the body portion
    const upperKey = 'sk_test_A1B2C3D4E5F6789012345678901234AB';
    expect(() => service.validate(upperKey)).toThrow(UnauthorizedException);
  });

  // ---------------------------------------------------------------------------
  // 5. Invalid format: special characters → rejected
  // ---------------------------------------------------------------------------

  it('should reject a key containing special characters', async () => {
    const service = await createService(VALID_KEY);
    const specialCharKey = 'sk_test_a1b2c3d4e5f6!@#$%^&*()12345678';
    expect(() => service.validate(specialCharKey)).toThrow(UnauthorizedException);
  });

  // ---------------------------------------------------------------------------
  // 6. Invalid format: empty string → rejected
  // ---------------------------------------------------------------------------

  it('should reject an empty string', async () => {
    const service = await createService(VALID_KEY);
    expect(() => service.validate('')).toThrow(UnauthorizedException);
  });

  // ---------------------------------------------------------------------------
  // 7. Unknown prefix (format valid, but prefix not in store) → 401
  // ---------------------------------------------------------------------------

  it('should reject a format-valid key whose prefix is not in the key store', async () => {
    const service = await createService(VALID_KEY);
    expect(() => service.validate(UNKNOWN_KEY)).toThrow(UnauthorizedException);
  });

  // ---------------------------------------------------------------------------
  // 8. Wrong key (prefix match, hash mismatch) → 401
  // ---------------------------------------------------------------------------

  it('should reject a key that has the correct prefix but fails hash comparison', async () => {
    const service = await createService(VALID_KEY);
    // WRONG_KEY starts with the same 16 chars as VALID_KEY but has different trailing chars
    expect(() => service.validate(WRONG_KEY)).toThrow(UnauthorizedException);
  });

  // ---------------------------------------------------------------------------
  // 9. Dev mode (no ALLOWED_API_KEYS) → format-valid keys accepted with warning logged
  // ---------------------------------------------------------------------------

  it('should accept any format-valid key when ALLOWED_API_KEYS is not configured (dev mode)', async () => {
    // No ALLOWED_API_KEYS → keyHashes map stays empty → format-only validation
    const service = await createService(undefined);
    expect(() => service.validate(VALID_KEY)).not.toThrow();
    expect(() => service.validate(UNKNOWN_KEY)).not.toThrow();
    expect(() => service.validate(WRONG_KEY)).not.toThrow();
  });
});
