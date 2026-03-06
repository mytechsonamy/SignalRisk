import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Legacy in-memory controller + service (kept for backwards compatibility)
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';

// New PostgreSQL-backed merchant management API
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { MerchantRepository } from './merchant.repository';
import { ApiKeyAuditService } from './api-key-audit.service';
import { DataExportService } from './data-export.service';
import { DataExportController } from './data-export.controller';

export const PG_POOL = 'PG_POOL';

@Module({
  imports: [ConfigModule],
  controllers: [MerchantsController, MerchantController, DataExportController],
  providers: [
    // Legacy in-memory service
    MerchantsService,
    // API Key Audit service
    ApiKeyAuditService,
    // pg Pool factory
    {
      provide: PG_POOL,
      useFactory: (config: ConfigService) =>
        new Pool({
          connectionString: config.get<string>(
            'DATABASE_URL',
            'postgresql://localhost:5432/signalrisk',
          ),
        }),
      inject: [ConfigService],
    },
    // Repository — inject the Pool via token
    {
      provide: MerchantRepository,
      useFactory: (pool: Pool) => new MerchantRepository(pool),
      inject: [PG_POOL],
    },
    // Service
    MerchantService,
    // Data Export (GDPR Art. 15)
    {
      provide: DataExportService,
      useFactory: (pool: Pool) => new DataExportService(pool),
      inject: [PG_POOL],
    },
  ],
  exports: [MerchantsService, MerchantService, ApiKeyAuditService, DataExportService],
})
export class MerchantsModule {}
