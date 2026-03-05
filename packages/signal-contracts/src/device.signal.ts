export interface DeviceSignal {
  deviceId: string;
  merchantId: string;
  fingerprint: string;
  trustScore: number;        // 0-100
  isEmulator: boolean;
  emulatorConfidence: number; // 0-1
  platform: 'web' | 'android' | 'ios';
  firstSeenAt: Date;
  lastSeenAt: Date;
  daysSinceFirstSeen: number;
}
