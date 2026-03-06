export interface TelcoInput {
  phoneNumber?: string;
  countryCode?: string;    // ISO-3166-1 alpha-2 e.g. 'ZA', 'US'
  carrierName?: string;
  lineType?: 'mobile' | 'voip' | 'landline' | 'unknown';
  sessionCountryCode?: string; // country from IP, for mismatch detection
}

export interface TelcoSignal {
  lineType: string;
  carrier: string;
  riskScore: number;       // 0-100
  isVoip: boolean;
  isDisposable: boolean;
  isBurner: boolean;
  countryMismatch: boolean;
  confidence: number;      // 0-1
}
