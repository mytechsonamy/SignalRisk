import AsyncStorage from '@react-native-async-storage/async-storage';
import { MobileFingerprint, MobileFingerprintData } from './fingerprint/MobileFingerprint';
import { MobileEventBatcher } from './events/MobileEventBatcher';

export interface SignalRiskClientConfig {
  baseUrl: string;
  apiKey: string;
}

export class SignalRiskClient {
  private fingerprinter: MobileFingerprint | null = null;
  private batcher: MobileEventBatcher;
  private sessionId: string;
  private deviceId: string = '';
  private fingerprintData: MobileFingerprintData | null = null;

  constructor(private readonly config: SignalRiskClientConfig) {
    this.sessionId = Math.random().toString(36).substring(2);
    this.batcher = new MobileEventBatcher({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    });
  }

  async init(): Promise<void> {
    // Load or generate device ID
    let deviceId = await AsyncStorage.getItem('signalrisk_device_id');
    if (!deviceId) {
      deviceId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      await AsyncStorage.setItem('signalrisk_device_id', deviceId);
    }
    this.deviceId = deviceId;
    this.fingerprinter = new MobileFingerprint(deviceId);
    this.fingerprintData = this.fingerprinter.collect();
    this.batcher.start();
  }

  track(eventType: string, payload: Record<string, unknown> = {}): void {
    if (!this.deviceId) throw new Error('SignalRiskClient not initialized — call init() first');
    this.batcher.add({
      type: eventType,
      payload,
      sessionId: this.sessionId,
      deviceId: this.deviceId,
      timestamp: new Date().toISOString(),
    });
  }

  async flush(): Promise<void> {
    await this.batcher.flush();
  }

  destroy(): void {
    this.batcher.destroy();
  }

  getFingerprint(): MobileFingerprintData | null {
    return this.fingerprintData;
  }
}
