import { Body, Controller, Post } from '@nestjs/common';
import { WebhookConfigService } from './webhook-config.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { SlaBreachDto } from './dto/sla-breach.dto';
import { WebhookPayload } from './webhook.types';

@Controller('internal/sla-breach')
export class SlaBreachController {
  constructor(
    private readonly webhookConfigService: WebhookConfigService,
    private readonly webhookDeliveryService: WebhookDeliveryService,
  ) {}

  @Post()
  async handleSlaBreachAlert(
    @Body() breach: SlaBreachDto,
  ): Promise<{ delivered: boolean }> {
    const config = await this.webhookConfigService.getWebhookConfig(
      breach.merchantId,
    );
    if (!config) {
      return { delivered: false };
    }

    const payload: WebhookPayload = {
      event: 'case.sla_breach',
      requestId: breach.caseId,
      merchantId: breach.merchantId,
      outcome: breach.priority,
      riskScore: breach.riskScore,
      timestamp: breach.breachedAt,
    };

    await this.webhookDeliveryService.deliver(config, payload);
    return { delivered: true };
  }
}
