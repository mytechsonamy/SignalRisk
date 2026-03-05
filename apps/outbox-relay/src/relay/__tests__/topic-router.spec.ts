import { resolveTopicForEvent } from '../topic-router';

describe('TopicRouter', () => {
  describe('resolveTopicForEvent', () => {
    it('routes DECISION + created to signalrisk.decisions', () => {
      expect(resolveTopicForEvent('DECISION', 'created')).toBe(
        'signalrisk.decisions',
      );
    });

    it('routes DECISION + updated to signalrisk.decisions', () => {
      expect(resolveTopicForEvent('DECISION', 'updated')).toBe(
        'signalrisk.decisions',
      );
    });

    it('routes DEVICE + updated to signalrisk.events.raw', () => {
      expect(resolveTopicForEvent('DEVICE', 'updated')).toBe(
        'signalrisk.events.raw',
      );
    });

    it('routes DEVICE + created to signalrisk.events.raw', () => {
      expect(resolveTopicForEvent('DEVICE', 'created')).toBe(
        'signalrisk.events.raw',
      );
    });

    it('routes RULE + changed to signalrisk.rules.changes', () => {
      expect(resolveTopicForEvent('RULE', 'changed')).toBe(
        'signalrisk.rules.changes',
      );
    });

    it('routes RULE + created to signalrisk.rules.changes', () => {
      expect(resolveTopicForEvent('RULE', 'created')).toBe(
        'signalrisk.rules.changes',
      );
    });

    it('routes RULE + deleted to signalrisk.rules.changes', () => {
      expect(resolveTopicForEvent('RULE', 'deleted')).toBe(
        'signalrisk.rules.changes',
      );
    });

    it('routes EVENT + created to signalrisk.events.raw', () => {
      expect(resolveTopicForEvent('EVENT', 'created')).toBe(
        'signalrisk.events.raw',
      );
    });

    it('routes MERCHANT + updated to signalrisk.merchants', () => {
      expect(resolveTopicForEvent('MERCHANT', 'updated')).toBe(
        'signalrisk.merchants',
      );
    });

    it('falls back to unrouted for unknown aggregate type', () => {
      expect(resolveTopicForEvent('UNKNOWN', 'created')).toBe(
        'signalrisk.events.unrouted',
      );
    });

    it('falls back to unrouted for known aggregate but unknown event', () => {
      expect(resolveTopicForEvent('DECISION', 'deleted')).toBe(
        'signalrisk.events.unrouted',
      );
    });
  });
});
