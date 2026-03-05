import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhookConfigService } from './webhook-config.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { SlaBreachController } from './sla-breach.controller';

@Module({
  imports: [ConfigModule],
  controllers: [SlaBreachController],
  providers: [WebhookConfigService, WebhookDeliveryService],
  exports: [WebhookConfigService, WebhookDeliveryService],
})
export class WebhookModule {}
