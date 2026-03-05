import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { JwksController } from '../jwks.controller';
import { KeyManager } from '../key-manager';

describe('JwksController', () => {
  let controller: JwksController;
  let keyManager: Partial<KeyManager>;

  const { publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const mockJwk = publicKey.export({ format: 'jwk' });

  beforeEach(async () => {
    keyManager = {
      getAllActivePublicKeys: jest.fn().mockReturnValue([
        {
          kty: mockJwk.kty,
          use: 'sig',
          kid: 'test-kid-1',
          alg: 'RS256',
          n: mockJwk.n,
          e: mockJwk.e,
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JwksController],
      providers: [
        {
          provide: KeyManager,
          useValue: keyManager,
        },
      ],
    }).compile();

    controller = module.get<JwksController>(JwksController);
  });

  describe('GET /.well-known/jwks.json', () => {
    it('should return JWKS with keys array', () => {
      const result = controller.getJwks();

      expect(result).toHaveProperty('keys');
      expect(Array.isArray(result.keys)).toBe(true);
      expect(result.keys).toHaveLength(1);
    });

    it('should return keys in JWK format with required fields', () => {
      const result = controller.getJwks();
      const key = result.keys[0];

      expect(key.kty).toBe('RSA');
      expect(key.use).toBe('sig');
      expect(key.kid).toBe('test-kid-1');
      expect(key.alg).toBe('RS256');
      expect(key.n).toBeDefined();
      expect(key.e).toBeDefined();
    });

    it('should return multiple keys when rotation is active', () => {
      (keyManager.getAllActivePublicKeys as jest.Mock).mockReturnValue([
        {
          kty: 'RSA',
          use: 'sig',
          kid: 'key-1',
          alg: 'RS256',
          n: 'abc',
          e: 'AQAB',
        },
        {
          kty: 'RSA',
          use: 'sig',
          kid: 'key-2',
          alg: 'RS256',
          n: 'def',
          e: 'AQAB',
        },
      ]);

      const result = controller.getJwks();
      expect(result.keys).toHaveLength(2);
      expect(result.keys[0].kid).toBe('key-1');
      expect(result.keys[1].kid).toBe('key-2');
    });

    it('should return empty keys array when no active keys', () => {
      (keyManager.getAllActivePublicKeys as jest.Mock).mockReturnValue([]);

      const result = controller.getJwks();
      expect(result.keys).toEqual([]);
    });
  });
});
