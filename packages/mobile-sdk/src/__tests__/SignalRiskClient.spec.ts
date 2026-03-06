import { SignalRiskClient } from '../SignalRiskClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('SignalRiskClient', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = mockFetch;
    jest.useFakeTimers();
    // Reset AsyncStorage mock state
    (AsyncStorage.getItem as jest.Mock).mockReset();
    (AsyncStorage.setItem as jest.Mock).mockReset();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('init() loads deviceId from AsyncStorage if present', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('stored-device-id');
    const client = new SignalRiskClient({ baseUrl: 'http://api.test', apiKey: 'key' });
    await client.init();
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('signalrisk_device_id');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    const fp = client.getFingerprint();
    expect(fp?.deviceId).toBe('stored-device-id');
    client.destroy();
  });

  it('init() generates and stores new deviceId if not present', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const client = new SignalRiskClient({ baseUrl: 'http://api.test', apiKey: 'key' });
    await client.init();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('signalrisk_device_id', expect.any(String));
    client.destroy();
  });

  it('init() calls MobileFingerprint.collect() and sets fingerprintData', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-xyz');
    const client = new SignalRiskClient({ baseUrl: 'http://api.test', apiKey: 'key' });
    await client.init();
    const fp = client.getFingerprint();
    expect(fp).not.toBeNull();
    expect(fp?.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    client.destroy();
  });

  it('track() adds event to batcher (check getBufferSize)', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-123');
    const client = new SignalRiskClient({ baseUrl: 'http://api.test', apiKey: 'key' });
    await client.init();
    // Access batcher via cast to check buffer size
    const batcher = (client as any).batcher;
    client.track('page_view', { page: '/home' });
    expect(batcher.getBufferSize()).toBe(1);
    client.destroy();
  });

  it('track() throws if not initialized', () => {
    const client = new SignalRiskClient({ baseUrl: 'http://api.test', apiKey: 'key' });
    expect(() => client.track('page_view')).toThrow('SignalRiskClient not initialized');
  });

  it('flush() calls batcher.flush()', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-abc');
    const client = new SignalRiskClient({ baseUrl: 'http://api.test', apiKey: 'key' });
    await client.init();
    const batcher = (client as any).batcher;
    const flushSpy = jest.spyOn(batcher, 'flush');
    await client.flush();
    expect(flushSpy).toHaveBeenCalled();
    client.destroy();
  });

  it('destroy() calls batcher.destroy()', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-abc');
    const client = new SignalRiskClient({ baseUrl: 'http://api.test', apiKey: 'key' });
    await client.init();
    const batcher = (client as any).batcher;
    const destroySpy = jest.spyOn(batcher, 'destroy');
    client.destroy();
    expect(destroySpy).toHaveBeenCalled();
  });

  it('getFingerprint() returns fingerprint data after init', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-fingerprint-test');
    const client = new SignalRiskClient({ baseUrl: 'http://api.test', apiKey: 'key' });
    await client.init();
    const fp = client.getFingerprint();
    expect(fp).not.toBeNull();
    expect(fp?.platform).toBe('ios');
    expect(fp?.screenSize).toBe('390x844');
    expect(fp?.deviceId).toBe('device-fingerprint-test');
    client.destroy();
  });
});
