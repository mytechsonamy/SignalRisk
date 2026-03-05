import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhookConfigService } from './webhook-config.service';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Module({
  imports: [ConfigModule],
  providers: [WebhookConfigService, WebhookDeliveryService],
  exports: [WebhookConfigService, WebhookDeliveryService],
})
export class WebhookModule {}
