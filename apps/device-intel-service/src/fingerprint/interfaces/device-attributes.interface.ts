/**
 * Raw device attributes collected from the client SDK.
 *
 * Used as input for fingerprint generation. Stable attributes
 * (screen, GPU, timezone, webglHash, canvasHash) are hashed
 * to produce the fingerprint; optional fields enrich trust scoring.
 */
export interface DeviceAttributes {
  screenResolution: string;
  gpuRenderer: string;
  timezone: string;
  language: string;
  fonts?: string[];
  webglHash: string;
  canvasHash: string;
  audioHash?: string;
  androidId?: string;
  playIntegrityToken?: string;
  sensorNoise?: number[];
  platform: 'web' | 'android';
}

/**
 * Persisted device record matching the `devices` table schema.
 */
export interface Device {
  id: string;
  merchantId: string;
  fingerprint: string;
  fingerprintPrefix: string;
  trustScore: number;
  isEmulator: boolean;
  attributes: DeviceAttributes;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

/**
 * Result returned from the identify endpoint.
 */
export interface IdentifyResult {
  deviceId: string;
  fingerprint: string;
  trustScore: number;
  isNew: boolean;
  isEmulator: boolean;
}
