import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Admin } from 'kafkajs';
import { EventEmitter } from 'events';

export interface ConsumerGroupLag {
  groupId: string;
  topic: string;
  partition: number;
  lag: number;
}

export interface LagReport {
  timestamp: Date;
  groups: ConsumerGroupLag[];
  criticalGroups: string[];
}

@Injectable()
export class KafkaLagService implements OnModuleInit, OnModuleDestroy {
  private admin: Admin;
  private intervalId: NodeJS.Timeout | null = null;
  private lastReport: LagReport | null = null;
  readonly emitter = new EventEmitter();

  constructor(private readonly configService: ConfigService) {
    const kafka = new Kafka({
      brokers: [this.configService.get<string>('KAFKA_BROKER', 'localhost:9092')],
    });
    this.admin = kafka.admin();
  }

  async getLagReport(): Promise<LagReport> {
    await this.admin.connect();

    const groups = await this.admin.listGroups();
    const groupIds = groups.groups.map((g) => g.groupId);

    const allLags: ConsumerGroupLag[] = [];

    for (const groupId of groupIds) {
      const offsets = await this.admin.fetchOffsets({ groupId });

      for (const topicOffsets of offsets) {
        const topic = topicOffsets.topic;
        const topicPartitions = topicOffsets.partitions.map((p) => ({
          topic,
          partition: p.partition,
        }));

        const topicEndOffsets = await this.admin.fetchTopicOffsets(topic);

        for (const partitionOffset of topicOffsets.partitions) {
          const endOffset = topicEndOffsets.find(
            (eo) => eo.partition === partitionOffset.partition,
          );

          if (endOffset) {
            const consumerOffset = parseInt(partitionOffset.offset, 10);
            const topicOffset = parseInt(endOffset.offset, 10);
            const lag = Math.max(0, topicOffset - consumerOffset);

            allLags.push({
              groupId,
              topic,
              partition: partitionOffset.partition,
              lag,
            });
          }
        }
      }
    }

    await this.admin.disconnect();

    const criticalGroups = [
      ...new Set(
        allLags
          .filter((l) => l.lag > 1000)
          .map((l) => l.groupId),
      ),
    ];

    const report: LagReport = {
      timestamp: new Date(),
      groups: allLags,
      criticalGroups,
    };

    this.lastReport = report;
    return report;
  }

  getPrometheusMetrics(): string {
    const lines: string[] = [
      '# HELP kafka_consumer_lag Number of messages the consumer group is behind the latest offset',
      '# TYPE kafka_consumer_lag gauge',
    ];

    if (!this.lastReport || this.lastReport.groups.length === 0) {
      return lines.join('\n') + '\n';
    }

    for (const entry of this.lastReport.groups) {
      lines.push(
        `kafka_consumer_lag{group="${entry.groupId}",topic="${entry.topic}",partition="${entry.partition}"} ${entry.lag}`,
      );
    }

    return lines.join('\n') + '\n';
  }

  async onModuleInit(): Promise<void> {
    this.intervalId = setInterval(async () => {
      try {
        const report = await this.getLagReport();
        if (report.criticalGroups.length > 0) {
          this.emitter.emit('lag.critical', report);
        }
      } catch (err) {
        // swallow polling errors to keep interval alive
      }
    }, 30_000);
  }

  onModuleDestroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.admin.disconnect().catch(() => {
      // ignore disconnect errors on shutdown
    });
  }
}
