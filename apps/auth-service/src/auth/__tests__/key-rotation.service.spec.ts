import { Test, TestingModule } from '@nestjs/testing';
import { KeyRotationService, KeyPair } from '../key-rotation.service';

describe('KeyRotationService', () => {
  let service: KeyRotationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KeyRotationService],
    }).compile();

    service = module.get<KeyRotationService>(KeyRotationService);
  });

  describe('onModuleInit', () => {
    it('should create initial keypair on init', () => {
      service.onModuleInit();
      const keys = service.getPublicKeys();
      expect(keys.length).toBeGreaterThanOrEqual(1);
    });

    it('should set activeKid after init', () => {
      service.onModuleInit();
      const { kid } = service.getActivePrivateKey();
      expect(kid).toBeTruthy();
      expect(kid).toMatch(/^key-\d+$/);
    });
  });

  describe('generateNewKeyPair', () => {
    it('should return keypair with kid, privateKey, publicKey', () => {
      const kp: KeyPair = service.generateNewKeyPair();
      expect(kp.kid).toBeTruthy();
      expect(kp.privateKey).toContain('-----BEGIN RSA PRIVATE KEY-----');
      expect(kp.publicKey).toContain('-----BEGIN RSA PUBLIC KEY-----');
    });

    it('should set kid in format key-<timestamp>', () => {
      const before = Date.now();
      const kp = service.generateNewKeyPair();
      const after = Date.now();
      const ts = parseInt(kp.kid.replace('key-', ''), 10);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('should set expiresAt to createdAt + 25h', () => {
      const kp = service.generateNewKeyPair();
      const diff = kp.expiresAt.getTime() - kp.createdAt.getTime();
      expect(diff).toBe(25 * 60 * 60 * 1000);
    });

    it('should update activeKid to newly generated key', () => {
      service.generateNewKeyPair();
      const kp2 = service.generateNewKeyPair();
      const { kid } = service.getActivePrivateKey();
      expect(kid).toBe(kp2.kid);
    });
  });

  describe('getPublicKeys', () => {
    it('should return all non-expired keys', () => {
      service.onModuleInit();
      service.rotateKeys();
      const keys = service.getPublicKeys();
      expect(keys.length).toBeGreaterThanOrEqual(2);
    });

    it('should not return expired keys', () => {
      // Generate a key and manually set it as expired
      const kp = service.generateNewKeyPair();
      // Mutate expiry to be in the past by directly patching via the service
      // Access internal keys via generateNewKeyPair side effects by time-mocking
      const realDateNow = Date.now;
      // Fast-forward past expiry
      Date.now = jest.fn(() => realDateNow() + 26 * 60 * 60 * 1000);
      try {
        // Generate a new key so the old one gets pruned or expired
        const freshKp = service.generateNewKeyPair();
        const publicKeys = service.getPublicKeys();
        // Only fresh key should appear (old one is expired in mocked time)
        const freshKeyEntry = publicKeys.find(k => k.kid === freshKp.kid);
        expect(freshKeyEntry).toBeDefined();
        // The original kp should NOT appear since its expiresAt < mocked now
        const oldKeyEntry = publicKeys.find(k => k.kid === kp.kid);
        expect(oldKeyEntry).toBeUndefined();
      } finally {
        Date.now = realDateNow;
      }
    });

    it('should return kid, publicKey, and notAfter for each entry', () => {
      service.onModuleInit();
      const keys = service.getPublicKeys();
      for (const k of keys) {
        expect(k.kid).toBeTruthy();
        expect(k.publicKey).toBeTruthy();
        expect(k.notAfter).toBeInstanceOf(Date);
      }
    });
  });

  describe('getActivePrivateKey', () => {
    it('should return the most recently added key private key', () => {
      service.onModuleInit();
      const kp1 = service.rotateKeys();
      const kp2 = service.rotateKeys();
      const { privateKey, kid } = service.getActivePrivateKey();
      expect(kid).toBe(kp2.kid);
      expect(privateKey).toBe(kp2.privateKey);
    });

    it('should throw if no keys are present', () => {
      // Access private field to clear keys
      (service as any).keys = [];
      (service as any).activeKid = '';
      expect(() => service.getActivePrivateKey()).toThrow('No active key found');
    });
  });

  describe('rotateKeys', () => {
    it('should add a new key and return it', () => {
      service.onModuleInit();
      const initialCount = service.getPublicKeys().length;
      const newKp = service.rotateKeys();
      const keys = service.getPublicKeys();
      expect(keys.length).toBeGreaterThan(initialCount);
      expect(keys.find(k => k.kid === newKp.kid)).toBeDefined();
    });

    it('should keep the old key during overlap window (both accessible)', () => {
      service.onModuleInit();
      const firstKeys = service.getPublicKeys();
      const firstKid = firstKeys[0].kid;

      service.rotateKeys();
      const afterRotation = service.getPublicKeys();

      // Both old and new key should exist (within 25h overlap)
      const oldKeyStillPresent = afterRotation.find(k => k.kid === firstKid);
      expect(oldKeyStillPresent).toBeDefined();
    });
  });
});
