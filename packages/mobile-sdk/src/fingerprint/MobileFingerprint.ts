import { Platform, Dimensions } from 'react-native';

export interface MobileFingerprintData {
  fingerprint: string;
  platform: 'ios' | 'android';
  screenSize: string;
  locale: string;
  timezone: string;
  deviceId: string;
}

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // unsigned 32-bit
}

export class MobileFingerprint {
  private deviceId: string;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  collect(): MobileFingerprintData {
    const { width, height } = Dimensions.get('window');
    const platform = Platform.OS as 'ios' | 'android';
    const screenSize = `${width}x${height}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'en';

    const raw = [platform, screenSize, timezone, locale, this.deviceId].join('|');
    const fingerprint = djb2(raw).toString(16).padStart(8, '0');

    return { fingerprint, platform, screenSize, locale, timezone, deviceId: this.deviceId };
  }

  static djb2(str: string): number { return djb2(str); }
}
