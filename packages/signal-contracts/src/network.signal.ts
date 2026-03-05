export interface NetworkSignal {
  ip: string;
  merchantId: string;
  country?: string;
  city?: string;
  asn?: string;
  isProxy: boolean;
  isVpn: boolean;
  isTor: boolean;
  isDatacenter: boolean;
  geoMismatchScore: number;   // 0-100
  riskScore: number;          // 0-100
}
