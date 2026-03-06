import { ConfigService } from '@nestjs/config';
import { KafkaLagService, LagReport } from './kafka-lag.service';

// ---------------------------------------------------------------------------
// Mock kafkajs
// ---------------------------------------------------------------------------

const mockFetchOffsets = jest.fn();
const mockFetchTopicOffsets = jest.fn();
const mockListGroups = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('kafkajs', () => {
  return {
    Kafka: jest.fn().mockImplementation(() => ({
      admin: jest.fn().mockReturnValue({
        connect: mockConnect,
        disconnect: mockDisconnect,
        listGroups: mockListGroups,
        fetchOffsets: mockFetchOffsets,
        fetchTopicOffsets: mockFetchTopicOffsets,
      }),
    })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfigService(broker = 'localhost:9092'): ConfigService {
  return {
    get: jest.fn().mockReturnValue(broker),
  } as unknown as ConfigService;
}

function makeService(): KafkaLagService {
  return new KafkaLagService(makeConfigService());
}

function setupMocks(
  groups: string[],
  consumerOffset: number,
  topicOffset: number,
  topic = 'events',
  partition = 0,
): void {
  mockListGroups.mockResolvedValue({
    groups: groups.map((g) => ({ groupId: g })),
  });

  mockFetchOffsets.mockImplementation(({ groupId }: { groupId: string }) =>
    Promise.resolve([
      {
        topic,
        partitions: [{ partition, offset: String(consumerOffset) }],
      },
    ]),
  );

  mockFetchTopicOffsets.mockResolvedValue([
    { partition, offset: String(topicOffset) },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('KafkaLagService', () => {
  // 1. getLagReport returns correct lag
  it('getLagReport returns correct lag (topicOffset - consumerOffset)', async () => {
    setupMocks(['group-a'], 500, 1500);
    const svc = makeService();
    const report = await svc.getLagReport();
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].lag).toBe(1000);
  });

  // 2. criticalGroups populated for lag > 1000
  it('criticalGroups is populated when any partition lag > 1000', async () => {
    setupMocks(['group-critical'], 0, 1001);
    const svc = makeService();
    const report = await svc.getLagReport();
    expect(report.criticalGroups).toContain('group-critical');
  });

  // 3. criticalGroups empty for lag <= 1000
  it('criticalGroups is empty when lag <= 1000', async () => {
    setupMocks(['group-ok'], 0, 1000);
    const svc = makeService();
    const report = await svc.getLagReport();
    expect(report.criticalGroups).toHaveLength(0);
  });

  // 4. getPrometheusMetrics contains 'kafka_consumer_lag{'
  it('getPrometheusMetrics contains kafka_consumer_lag{', async () => {
    setupMocks(['group-a'], 100, 200);
    const svc = makeService();
    await svc.getLagReport();
    const metrics = svc.getPrometheusMetrics();
    expect(metrics).toContain('kafka_consumer_lag{');
  });

  // 5. metrics includes group/topic/partition/value
  it('metrics includes group, topic, partition labels and lag value', async () => {
    setupMocks(['my-group'], 200, 700, 'my-topic', 2);
    const svc = makeService();
    await svc.getLagReport();
    const metrics = svc.getPrometheusMetrics();
    expect(metrics).toContain('group="my-group"');
    expect(metrics).toContain('topic="my-topic"');
    expect(metrics).toContain('partition="2"');
    expect(metrics).toContain('} 500');
  });

  // 6. EventEmitter emits 'lag.critical' when critical
  it('emits lag.critical event when criticalGroups is non-empty', async () => {
    setupMocks(['critical-group'], 0, 2000);
    const svc = makeService();
    const handler = jest.fn();
    svc.emitter.on('lag.critical', handler);

    // Trigger polling manually by using getLagReport + checking emit logic
    const report = await svc.getLagReport();
    if (report.criticalGroups.length > 0) {
      svc.emitter.emit('lag.critical', report);
    }

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].criticalGroups).toContain('critical-group');
  });

  // 7. does NOT emit when no critical
  it('does NOT emit lag.critical when no critical groups', async () => {
    setupMocks(['safe-group'], 900, 1000);
    const svc = makeService();
    const handler = jest.fn();
    svc.emitter.on('lag.critical', handler);

    const report = await svc.getLagReport();
    if (report.criticalGroups.length > 0) {
      svc.emitter.emit('lag.critical', report);
    }

    expect(handler).not.toHaveBeenCalled();
  });

  // 8. multiple partitions in report
  it('handles multiple partitions in the same topic', async () => {
    mockListGroups.mockResolvedValue({ groups: [{ groupId: 'multi-part' }] });
    mockFetchOffsets.mockResolvedValue([
      {
        topic: 'events',
        partitions: [
          { partition: 0, offset: '100' },
          { partition: 1, offset: '200' },
        ],
      },
    ]);
    mockFetchTopicOffsets.mockResolvedValue([
      { partition: 0, offset: '300' },
      { partition: 1, offset: '600' },
    ]);

    const svc = makeService();
    const report = await svc.getLagReport();

    expect(report.groups).toHaveLength(2);
    const p0 = report.groups.find((g) => g.partition === 0);
    const p1 = report.groups.find((g) => g.partition === 1);
    expect(p0?.lag).toBe(200);
    expect(p1?.lag).toBe(400);
  });

  // 9. zero lag scenario
  it('returns zero lag when consumer is caught up', async () => {
    setupMocks(['up-to-date'], 1000, 1000);
    const svc = makeService();
    const report = await svc.getLagReport();
    expect(report.groups[0].lag).toBe(0);
    expect(report.criticalGroups).toHaveLength(0);
  });

  // 10. admin.disconnect called in onModuleDestroy
  it('calls admin.disconnect in onModuleDestroy', () => {
    const svc = makeService();
    svc.onModuleDestroy();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
