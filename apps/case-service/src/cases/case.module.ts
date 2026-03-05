import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { CaseController } from './case.controller';
import { CaseService } from './case.service';
import { CaseRepository } from './case.repository';

const PG_POOL_TOKEN = 'PG_POOL';

@Module({
  imports: [ConfigModule],
  controllers: [CaseController],
  providers: [
    {
      provide: PG_POOL_TOKEN,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Pool => {
        const db = configService.get('database');
        return new Pool({
          host: db?.host || 'localhost',
          port: db?.port || 5432,
          user: db?.username || 'signalrisk',
          password: db?.password || 'signalrisk',
          database: db?.database || 'signalrisk',
          ssl: db?.ssl ? { rejectUnauthorized: false } : false,
          max: 20,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        });
      },
    },
    {
      provide: CaseRepository,
      inject: [PG_POOL_TOKEN],
      useFactory: (pool: Pool) => new CaseRepository(pool),
    },
    CaseService,
  ],
  exports: [CaseService],
})
export class CaseModule {}
