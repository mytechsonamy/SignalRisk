import { MobileFingerprint } from '../fingerprint/MobileFingerprint';

describe('MobileFingerprint', () => {
  it('djb2 hash is stable for same input', () => {
    const hash1 = MobileFingerprint.djb2('hello world');
    const hash2 = MobileFingerprint.djb2('hello world');
    expect(hash1).toBe(hash2);
  });

  it('different inputs produce different hashes', () => {
    const hash1 = MobileFingerprint.djb2('input-a');
    const hash2 = MobileFingerprint.djb2('input-b');
    expect(hash1).not.toBe(hash2);
  });

  it('collect() returns platform = ios from mock', () => {
    const fp = new MobileFingerprint('device-123');
    const data = fp.collect();
    expect(data.platform).toBe('ios');
  });

  it('collect() returns screenSize 390x844 from mock', () => {
    const fp = new MobileFingerprint('device-123');
    const data = fp.collect();
    expect(data.screenSize).toBe('390x844');
  });

  it('collect() fingerprint is 8-char hex string', () => {
    const fp = new MobileFingerprint('device-123');
    const data = fp.collect();
    expect(data.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it('collect() returns deviceId matching constructor arg', () => {
    const fp = new MobileFingerprint('my-unique-device');
    const data = fp.collect();
    expect(data.deviceId).toBe('my-unique-device');
  });

  it('same attrs produce same fingerprint (deterministic)', () => {
    const fp1 = new MobileFingerprint('device-abc');
    const fp2 = new MobileFingerprint('device-abc');
    expect(fp1.collect().fingerprint).toBe(fp2.collect().fingerprint);
  });

  it('different deviceIds produce different fingerprints', () => {
    const fp1 = new MobileFingerprint('device-001');
    const fp2 = new MobileFingerprint('device-002');
    expect(fp1.collect().fingerprint).not.toBe(fp2.collect().fingerprint);
  });
});
