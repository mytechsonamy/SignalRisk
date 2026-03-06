import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlagCheckResult } from './flags.types';

@Injectable()
export class FlagsClient {
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = configService.get('FEATURE_FLAG_URL', 'http://localhost:3013');
  }

  async isEnabled(flagName: string, merchantId: string): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/v1/flags/${encodeURIComponent(flagName)}/check?merchantId=${encodeURIComponent(merchantId)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(100) });
      if (!response.ok) return false;
      const result: FlagCheckResult = await response.json();
      return result.enabled;
    } catch {
      // Fail closed — if flag service is down, disable the feature
      return false;
    }
  }
}
