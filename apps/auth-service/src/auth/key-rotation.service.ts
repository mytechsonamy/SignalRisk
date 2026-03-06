import { Injectable, Logger } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';

export interface KeyPair {
  kid: string;
  privateKey: string;  // PEM
  publicKey: string;   // PEM
  createdAt: Date;
  expiresAt: Date;     // createdAt + 25h rotation window
}

@Injectable()
export class KeyRotationService {
  private readonly logger = new Logger(KeyRotationService.name);
  private keys: KeyPair[] = [];
  private activeKid: string = '';

  onModuleInit() {
    this.generateNewKeyPair();
    this.logger.log(`KeyRotationService initialized with key: ${this.activeKid}`);
  }

  generateNewKeyPair(): KeyPair {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });

    const nowMs = Date.now();
    const createdAt = new Date(nowMs);
    const expiresAt = new Date(nowMs + 25 * 60 * 60 * 1000); // +25h

    const kid = `key-${nowMs}`;

    const keyPair: KeyPair = {
      kid,
      privateKey,
      publicKey,
      createdAt,
      expiresAt,
    };

    this.keys.push(keyPair);
    this.activeKid = kid;

    // Prune expired keys (keep active key always)
    const pruneMs = Date.now();
    this.keys = this.keys.filter(
      k => k.expiresAt.getTime() > pruneMs || k.kid === this.activeKid,
    );

    this.logger.log(`Generated new key pair: ${kid}`);
    return keyPair;
  }

  getActivePrivateKey(): { privateKey: string; kid: string } {
    const activeKey = this.keys.find(k => k.kid === this.activeKid);
    if (!activeKey) {
      throw new Error('No active key found');
    }
    return { privateKey: activeKey.privateKey, kid: activeKey.kid };
  }

  getPublicKeys(): Array<{ kid: string; publicKey: string; notAfter: Date }> {
    const nowMs = Date.now();
    return this.keys
      .filter(k => k.expiresAt.getTime() > nowMs)
      .map(k => ({
        kid: k.kid,
        publicKey: k.publicKey,
        notAfter: k.expiresAt,
      }));
  }

  rotateKeys(): KeyPair {
    return this.generateNewKeyPair();
  }
}
