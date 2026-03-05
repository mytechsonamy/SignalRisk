import { Module } from '@nestjs/common';
import { PayguruEnrichmentConsumer } from './payguru-enrichment.consumer';
import { TelcoIntelModule } from '../telco/telco-intel.module';

@Module({
  imports: [TelcoIntelModule],
  providers: [PayguruEnrichmentConsumer],
  exports: [PayguruEnrichmentConsumer],
})
export class PayguruEnrichmentModule {}
