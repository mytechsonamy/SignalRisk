import { Injectable } from '@nestjs/common';
import { TelcoInput, TelcoSignal } from './telco.types';

// Known disposable/burner carrier keywords
const DISPOSABLE_CARRIERS = ['textfree', 'google voice', 'skype', 'twilio', 'bandwidth', 'vonage', 'magicjack'];
const BURNER_CARRIERS = ['burner', 'hushed', 'sideline', 'second line', 'cover me'];

@Injectable()
export class TelcoAnalysisService {
  analyze(input: TelcoInput): TelcoSignal {
    let riskScore = 0;
    const carrier = input.carrierName?.toLowerCase() ?? '';

    const isVoip = input.lineType === 'voip';
    const isDisposable = DISPOSABLE_CARRIERS.some(d => carrier.includes(d));
    const isBurner = BURNER_CARRIERS.some(b => carrier.includes(b));
    const countryMismatch = !!(
      input.countryCode && input.sessionCountryCode &&
      input.countryCode.toUpperCase() !== input.sessionCountryCode.toUpperCase()
    );

    if (isVoip) riskScore += 30;
    if (isDisposable) riskScore += 40;
    if (isBurner) riskScore += 25;
    if (countryMismatch) riskScore += 20;
    if (!input.phoneNumber) riskScore = 50; // unknown = medium risk

    riskScore = Math.max(0, Math.min(100, riskScore));
    const confidence = input.phoneNumber ? 0.8 : 0.3;

    return {
      lineType: input.lineType ?? 'unknown',
      carrier: input.carrierName ?? 'unknown',
      riskScore: Math.round(riskScore * 100) / 100,
      isVoip,
      isDisposable,
      isBurner,
      countryMismatch,
      confidence,
    };
  }
}
