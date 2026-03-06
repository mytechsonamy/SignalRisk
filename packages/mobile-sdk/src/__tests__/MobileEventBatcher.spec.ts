import { MobileEventBatcher, MobileEvent } from '../events/MobileEventBatcher';

function makeEvent(overrides: Partial<MobileEvent> = {}): MobileEvent {
  return {
    type: 'test_event',
    payload: { foo: 'bar' },
    sessionId: 'session-1',
    deviceId: 'device-1',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('MobileEventBatcher', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('add() buffers events', () => {
    const batcher = new MobileEventBatcher({ baseUrl: 'http://api.test', apiKey: 'key-1', maxBatchSize: 10 });
    batcher.add(makeEvent());
    batcher.add(makeEvent());
    expect(batcher.getBufferSize()).toBe(2);
    batcher.destroy();
  });

  it('add() triggers flush at maxBatchSize=10', () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const batcher = new MobileEventBatcher({ baseUrl: 'http://api.test', apiKey: 'key-1', maxBatchSize: 10 });
    for (let i = 0; i < 10; i++) {
      batcher.add(makeEvent());
    }
    // flush is triggered but async; buffer is cleared immediately
    expect(batcher.getBufferSize()).toBe(0);
    batcher.destroy();
  });

  it('flush() sends POST to correct URL', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const batcher = new MobileEventBatcher({ baseUrl: 'http://api.test', apiKey: 'key-1' });
    batcher.add(makeEvent());
    await batcher.flush();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://api.test/v1/events',
      expect.objectContaining({ method: 'POST' })
    );
    batcher.destroy();
  });

  it('flush() sets Authorization: ApiKey header', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const batcher = new MobileEventBatcher({ baseUrl: 'http://api.test', apiKey: 'secret-key' });
    batcher.add(makeEvent());
    await batcher.flush();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'ApiKey secret-key',
        }),
      })
    );
    batcher.destroy();
  });

  it('flush() clears buffer after send', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const batcher = new MobileEventBatcher({ baseUrl: 'http://api.test', apiKey: 'key-1' });
    batcher.add(makeEvent());
    batcher.add(makeEvent());
    await batcher.flush();
    expect(batcher.getBufferSize()).toBe(0);
    batcher.destroy();
  });

  it('flush() does nothing when buffer is empty', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const batcher = new MobileEventBatcher({ baseUrl: 'http://api.test', apiKey: 'key-1' });
    await batcher.flush();
    expect(mockFetch).not.toHaveBeenCalled();
    batcher.destroy();
  });

  it('retry on 429: sends up to 3 attempts', async () => {
    // Mock sleep to resolve immediately so retry doesn't actually wait
    jest.spyOn(MobileEventBatcher.prototype as any, 'sleep').mockResolvedValue(undefined);

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const batcher = new MobileEventBatcher({ baseUrl: 'http://api.test', apiKey: 'key-1' });
    batcher.add(makeEvent());
    await batcher.flush();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    batcher.destroy();
  });

  it('destroy() clears interval', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const batcher = new MobileEventBatcher({ baseUrl: 'http://api.test', apiKey: 'key-1' });
    batcher.start();
    batcher.destroy();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('getBufferSize() returns correct count', () => {
    const batcher = new MobileEventBatcher({ baseUrl: 'http://api.test', apiKey: 'key-1', maxBatchSize: 100 });
    batcher.add(makeEvent());
    batcher.add(makeEvent());
    batcher.add(makeEvent());
    expect(batcher.getBufferSize()).toBe(3);
    batcher.destroy();
  });

  it('batch sends all buffered events in one POST body', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const batcher = new MobileEventBatcher({ baseUrl: 'http://api.test', apiKey: 'key-1', maxBatchSize: 100 });
    const ev1 = makeEvent({ type: 'click' });
    const ev2 = makeEvent({ type: 'scroll' });
    const ev3 = makeEvent({ type: 'submit' });
    batcher.add(ev1);
    batcher.add(ev2);
    batcher.add(ev3);
    await batcher.flush();

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.events).toHaveLength(3);
    expect(body.events[0].type).toBe('click');
    expect(body.events[2].type).toBe('submit');
    batcher.destroy();
  });
});
