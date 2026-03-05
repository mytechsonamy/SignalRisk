export interface DeviceNode {
  deviceId: string;
  merchantId: string;
  fingerprint: string;
  trustScore: number;
  isEmulator: boolean;
  firstSeenAt: string;
}

export interface SessionNode {
  sessionId: string;
  merchantId: string;
  riskScore: number;
  isBot: boolean;
}

export interface SharingResult {
  deviceId: string;
  sharedAcrossMerchants: string[];
  sharingCount: number;
  isSuspicious: boolean; // true if sharingCount >= 3
}

export interface VelocityRing {
  merchantId: string;
  ringMembers: string[]; // other merchantIds
  sharedDeviceCount: number;
  avgTrustScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'; // HIGH if sharedDeviceCount >= 5
}
