export interface NetworkInput {
  ipAddress?: string;
  userAgent?: string;
  headers?: Record<string, string>;
}

export interface NetworkSignal {
  isProxy: boolean;
  isVpn: boolean;
  isTor: boolean;
  isDatacenter: boolean;
  ipRiskScore: number;   // 0-100
  asnOrg: string;
  countryCode: string;
  botScore: number;      // 0-100
}
