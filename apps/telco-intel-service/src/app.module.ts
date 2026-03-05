import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { TelcoIntelModule } from './telco/telco-intel.module';
import { PayguruEnrichmentModule } from './payguru/payguru-enrichment.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    TelcoIntelModule,
    PayguruEnrichmentModule,
    HealthModule,
  ],
})
export class AppModule {}
