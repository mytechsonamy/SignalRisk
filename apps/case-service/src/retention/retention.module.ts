import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DataRetentionService } from './data-retention.service';

export const RETENTION_PG_POOL = 'RETENTION_PG_POOL';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
  ],
  providers: [
    {
      provide: RETENTION_PG_POOL,
      useFactory: (config: ConfigService) =>
        new Pool({
          connectionString: config.get<string>(
            'DATABASE_URL',
            'postgresql://localhost:5432/signalrisk',
          ),
        }),
      inject: [ConfigService],
    },
    {
      provide: DataRetentionService,
      useFactory: (pool: Pool, config: ConfigService) =>
        new DataRetentionService(pool, config),
      inject: [RETENTION_PG_POOL, ConfigService],
    },
  ],
  exports: [DataRetentionService],
})
export class RetentionModule {}
