import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { StateFeedbackConsumer } from './state-feedback.consumer';
import { WatchlistService } from './watchlist.service';

const PG_FEEDBACK_POOL = 'PG_FEEDBACK_POOL';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_FEEDBACK_POOL,
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get('database');
        return new Pool({
          host: dbConfig?.host || 'localhost',
          port: dbConfig?.port || 5432,
          user: dbConfig?.username || 'signalrisk',
          password: dbConfig?.password || 'signalrisk',
          database: dbConfig?.database || 'signalrisk',
          ssl: dbConfig?.ssl ? { rejectUnauthorized: false } : false,
          max: 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        });
      },
      inject: [ConfigService],
    },
    {
      provide: WatchlistService,
      useFactory: (pool: Pool) => new WatchlistService(pool),
      inject: [PG_FEEDBACK_POOL],
    },
    {
      provide: StateFeedbackConsumer,
      useFactory: (configService: ConfigService, pool: Pool) =>
        new StateFeedbackConsumer(configService, pool),
      inject: [ConfigService, PG_FEEDBACK_POOL],
    },
  ],
  exports: [WatchlistService, StateFeedbackConsumer],
})
export class FeedbackModule {}
