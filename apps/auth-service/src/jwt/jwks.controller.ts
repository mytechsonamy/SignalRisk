import { Controller, Get, Header } from '@nestjs/common';
import { KeyManager, JwkPublicKey } from './key-manager';
import { Public } from '../auth/decorators/public.decorator';

@Controller()
export class JwksController {
  constructor(private readonly keyManager: KeyManager) {}

  @Get('.well-known/jwks.json')
  @Public()
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=900')
  @Header('Content-Type', 'application/json')
  getJwks(): { keys: JwkPublicKey[] } {
    return { keys: this.keyManager.getAllActivePublicKeys() };
  }
}
