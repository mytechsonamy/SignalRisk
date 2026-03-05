import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { OutboxRelayService } from './outbox-relay.service';
import { DedupService } from './dedup.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

export const PG_POOL = 'PG_POOL';

@Module({
  providers: [
    {
      provide: Pool,
      useFactory: (config: ConfigService) => {
        return new Pool({
          host: config.get<string>('database.host'),
          port: config.get<number>('database.port'),
          user: config.get<string>('database.user'),
          password: config.get<string>('database.password'),
          database: config.get<string>('database.database'),
          max: 5,
        });
      },
      inject: [ConfigService],
    },
    KafkaProducerService,
    DedupService,
    OutboxRelayService,
  ],
  exports: [OutboxRelayService],
})
export class OutboxRelayModule {}
