import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface ManagedKey {
  kid: string;
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  createdAt: Date;
  active: boolean;
}

export interface JwkPublicKey {
  kty: string;
  use: string;
  kid: string;
  alg: string;
  n: string;
  e: string;
}

@Injectable()
export class KeyManager implements OnModuleInit {
  private readonly logger = new Logger(KeyManager.name);
  private keys: Map<string, ManagedKey> = new Map();
  private currentKid: string | null = null;

  constructor(private readonly configService: ConfigService) {
    // Generate an ephemeral key immediately so getCurrentSigningKey() is always available
    // before onModuleInit fires. onModuleInit will replace it if env vars are set.
    const kid = 'signalrisk-auth-ephemeral';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    this.keys.set(kid, { kid, privateKey, publicKey, createdAt: new Date(), active: true });
    this.currentKid = kid;
  }

  async onModuleInit(): Promise<void> {
    await this.loadKeys();
  }

  private async loadKeys(): Promise<void> {
    const privateKeyPem = this.configService.get<string>('JWT_PRIVATE_KEY');
    const publicKeyPem = this.configService.get<string>('JWT_PUBLIC_KEY');
    const kid = this.configService.get<string>('JWT_KID', 'signalrisk-auth-1');

    if (privateKeyPem && publicKeyPem) {
      this.logger.log('Loading RSA key pair from environment variables');
      const privateKey = crypto.createPrivateKey(privateKeyPem);
      const publicKey = crypto.createPublicKey(publicKeyPem);

      this.keys.set(kid, {
        kid,
        privateKey,
        publicKey,
        createdAt: new Date(),
        active: true,
      });
      this.currentKid = kid;

      // Support rotated keys from JWT_PRIVATE_KEY_PREV / JWT_PUBLIC_KEY_PREV
      const prevPrivatePem = this.configService.get<string>('JWT_PRIVATE_KEY_PREV');
      const prevPublicPem = this.configService.get<string>('JWT_PUBLIC_KEY_PREV');
      const prevKid = this.configService.get<string>('JWT_KID_PREV');
      if (prevPrivatePem && prevPublicPem && prevKid) {
        this.logger.log('Loading previous RSA key pair for rotation');
        const prevPrivateKey = crypto.createPrivateKey(prevPrivatePem);
        const prevPublicKey = crypto.createPublicKey(prevPublicPem);
        this.keys.set(prevKid, {
          kid: prevKid,
          privateKey: prevPrivateKey,
          publicKey: prevPublicKey,
          createdAt: new Date(),
          active: true,
        });
      }
    } else {
      this.logger.warn(
        'No RSA key pair found in env vars — generating ephemeral key pair (NOT for production)',
      );
      await this.generateKeyPair(kid);
    }
  }

  async generateKeyPair(kid?: string): Promise<ManagedKey> {
    const resolvedKid = kid || `signalrisk-auth-${Date.now()}`;

    return new Promise<ManagedKey>((resolve, reject) => {
      crypto.generateKeyPair(
        'rsa',
        {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        },
        (err, publicKeyPem, privateKeyPem) => {
          if (err) return reject(err);

          const privateKey = crypto.createPrivateKey(privateKeyPem);
          const publicKey = crypto.createPublicKey(publicKeyPem);

          const managedKey: ManagedKey = {
            kid: resolvedKid,
            privateKey,
            publicKey,
            createdAt: new Date(),
            active: true,
          };

          this.keys.set(resolvedKid, managedKey);
          this.currentKid = resolvedKid;

          this.logger.log(`Generated RSA key pair with kid=${resolvedKid}`);
          resolve(managedKey);
        },
      );
    });
  }

  getCurrentSigningKey(): ManagedKey {
    if (!this.currentKid) {
      throw new Error('No signing key available');
    }
    const key = this.keys.get(this.currentKid);
    if (!key) {
      throw new Error(`Signing key ${this.currentKid} not found`);
    }
    return key;
  }

  getKeyByKid(kid: string): ManagedKey | undefined {
    return this.keys.get(kid);
  }

  getAllActivePublicKeys(): JwkPublicKey[] {
    const result: JwkPublicKey[] = [];
    for (const key of this.keys.values()) {
      if (!key.active) continue;
      const jwk = key.publicKey.export({ format: 'jwk' });
      result.push({
        kty: jwk.kty as string,
        use: 'sig',
        kid: key.kid,
        alg: 'RS256',
        n: jwk.n as string,
        e: jwk.e as string,
      });
    }
    return result;
  }

  deactivateKey(kid: string): boolean {
    const key = this.keys.get(kid);
    if (!key) return false;
    key.active = false;
    return true;
  }
}
