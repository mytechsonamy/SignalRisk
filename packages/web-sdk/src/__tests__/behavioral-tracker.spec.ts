import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BehavioralTracker } from '../behavioral/tracker';

describe('BehavioralTracker', () => {
  let tracker: BehavioralTracker;

  beforeEach(() => {
    tracker = new BehavioralTracker();
  });

  afterEach(() => {
    tracker.stop();
    vi.restoreAllMocks();
  });

  it('returns zero/false metrics initially', () => {
    const metrics = tracker.getMetrics();
    expect(metrics.clickCount).toBe(0);
    expect(metrics.timingCv).toBe(0);
    expect(metrics.mouseJitter).toBe(false);
    expect(metrics.scrollVelocity).toBe(0);
    expect(metrics.formFillSpeed).toBe(0);
  });

  it('start() attaches event listeners', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    tracker.start();

    const calls = addSpy.mock.calls.map(([event]) => event);
    expect(calls).toContain('mousemove');
    expect(calls).toContain('click');
    expect(calls).toContain('scroll');
  });

  it('stop() removes event listeners', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    tracker.start();
    tracker.stop();

    const calls = removeSpy.mock.calls.map(([event]) => event);
    expect(calls).toContain('mousemove');
    expect(calls).toContain('click');
    expect(calls).toContain('scroll');
  });

  it('click events update clickCount', () => {
    tracker.start();

    const clickEvent = new MouseEvent('click', { bubbles: true });
    document.dispatchEvent(clickEvent);
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(tracker.getMetrics().clickCount).toBe(3);
  });

  it('timingCv is computed correctly with multiple clicks', () => {
    tracker.start();

    // Create clicks with uniform intervals → CV should be near 0
    // We need at least 2 intervals (3 clicks)
    const times = [1000, 2000, 3000, 4000, 5000];
    for (const ts of times) {
      const event = new MouseEvent('click', { bubbles: true });
      // Override the read-only timeStamp property
      Object.defineProperty(event, 'timeStamp', { value: ts, configurable: true, writable: false });
      document.dispatchEvent(event);
    }

    const metrics = tracker.getMetrics();
    expect(metrics.clickCount).toBe(5);
    // Uniform intervals → stdDev = 0 → CV = 0
    expect(metrics.timingCv).toBe(0);
  });

  it('timingCv is non-zero for irregular click intervals', () => {
    tracker.start();

    // Very non-uniform intervals: 100, 1000, 100, 2000
    const times = [1000, 1100, 2100, 2200, 4200];
    for (const ts of times) {
      const event = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(event, 'timeStamp', { value: ts, configurable: true });
      document.dispatchEvent(event);
    }

    const metrics = tracker.getMetrics();
    expect(metrics.timingCv).toBeGreaterThan(0);
  });

  it('mouseJitter is true when non-integer coordinates are detected', () => {
    tracker.start();

    // First move to establish baseline
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 200 }));
    // Second move with fractional coordinates (clientX/Y are integers in MouseEvent,
    // so we need to dispatch custom events with fractional data)
    const event1 = new MouseEvent('mousemove', { clientX: 100, clientY: 200 });
    const event2 = new MouseEvent('mousemove', { clientX: 101, clientY: 200 });
    Object.defineProperty(event1, 'clientX', { value: 100.0 });
    Object.defineProperty(event1, 'clientY', { value: 200.0 });
    Object.defineProperty(event2, 'clientX', { value: 101.3 });
    Object.defineProperty(event2, 'clientY', { value: 200.7 });

    document.dispatchEvent(event1);
    document.dispatchEvent(event2);

    expect(tracker.getMetrics().mouseJitter).toBe(true);
  });

  it('mouseJitter remains false for integer-only mouse moves', () => {
    tracker.start();

    for (let i = 0; i < 10; i++) {
      document.dispatchEvent(
        new MouseEvent('mousemove', { clientX: i * 10, clientY: i * 5 })
      );
    }

    // Integer-only moves should not trigger jitter
    expect(tracker.getMetrics().mouseJitter).toBe(false);
  });

  it('navigationEntropy is >= 0', () => {
    const metrics = tracker.getMetrics();
    expect(metrics.navigationEntropy).toBeGreaterThanOrEqual(0);
  });

  it('stop() prevents further event processing', () => {
    tracker.start();
    tracker.stop();

    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(tracker.getMetrics().clickCount).toBe(0);
  });
});
