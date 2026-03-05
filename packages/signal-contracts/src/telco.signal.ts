export interface TelcoSignal {
  msisdn: string;
  merchantId: string;
  operator?: string;          // e.g. 'Turkcell', 'Vodafone', 'Turk Telekom'
  lineType?: 'prepaid' | 'postpaid' | 'unknown';
  isPorted: boolean;
  portDate?: Date;
  prepaidProbability: number; // 0-1
  countryCode?: string;       // e.g. 'TR'
}
