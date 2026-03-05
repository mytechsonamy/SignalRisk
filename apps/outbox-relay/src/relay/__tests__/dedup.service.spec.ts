import { DedupService } from '../dedup.service';
import { Pool } from 'pg';

describe('DedupService', () => {
  let service: DedupService;
  let mockPool: jest.Mocked<Pool>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    } as unknown as jest.Mocked<Pool>;

    service = new DedupService(mockPool);
  });

  describe('loadWatermark', () => {
    it('loads max published_at from the database', async () => {
      const date = new Date('2026-03-05T10:00:00Z');
      mockPool.query.mockResolvedValueOnce({
        rows: [{ max_published: date }],
      } as never);

      await service.loadWatermark();

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT MAX(published_at) AS max_published FROM outbox_events',
      );
      expect(service.getLastPublishedAt()).toEqual(date);
    });

    it('handles null when no events have been published', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ max_published: null }],
      } as never);

      await service.loadWatermark();

      expect(service.getLastPublishedAt()).toBeNull();
    });
  });

  describe('buildKafkaKey', () => {
    it('uses outbox event ID as the Kafka key', () => {
      const eventId = '550e8400-e29b-41d4-a716-446655440000';
      expect(service.buildKafkaKey(eventId)).toBe(eventId);
    });
  });

  describe('updateWatermark', () => {
    it('updates watermark when new date is later', () => {
      const earlier = new Date('2026-03-05T09:00:00Z');
      const later = new Date('2026-03-05T10:00:00Z');

      service.updateWatermark(earlier);
      expect(service.getLastPublishedAt()).toEqual(earlier);

      service.updateWatermark(later);
      expect(service.getLastPublishedAt()).toEqual(later);
    });

    it('does not regress watermark when new date is earlier', () => {
      const later = new Date('2026-03-05T10:00:00Z');
      const earlier = new Date('2026-03-05T09:00:00Z');

      service.updateWatermark(later);
      service.updateWatermark(earlier);

      expect(service.getLastPublishedAt()).toEqual(later);
    });
  });
});
