import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { WebhookConfig, WebhookPayload } from './webhook.types';
import { WebhookConfigService } from './webhook-config.service';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(private readonly webhookConfigService: WebhookConfigService) {}

  async deliver(config: WebhookConfig, payload: WebhookPayload): Promise<void> {
    const delays = [1000, 4000, 16000];

    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const body = JSON.stringify(payload);
        const hmac = crypto
          .createHmac('sha256', config.secret)
          .update(body)
          .digest('hex');

        const response = await fetch(config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-SignalRisk-Signature': `sha256=${hmac}`,
          },
          body,
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          this.logger.log(
            `Webhook delivered to ${config.url} for merchant ${config.merchantId} (attempt ${attempt + 1})`,
          );
          return;
        }

        this.logger.warn(
          `Webhook delivery failed with status ${response.status} for merchant ${config.merchantId} (attempt ${attempt + 1})`,
        );

        if (attempt < 2) {
          await sleep(delays[attempt]);
        }
      } catch (err) {
        this.logger.warn(
          `Webhook delivery error for merchant ${config.merchantId} (attempt ${attempt + 1}): ${(err as Error).message}`,
        );
        if (attempt < 2) {
          await sleep(delays[attempt]);
        }
      }
    }

    // All retries failed — send to DLQ
    await this.sendToDlq(config.merchantId, payload);
  }

  private async sendToDlq(merchantId: string, payload: WebhookPayload): Promise<void> {
    this.logger.error(
      `All webhook delivery attempts failed for merchant ${merchantId}. Sending to DLQ.`,
    );

    try {
      const redis = this.webhookConfigService.getRedis();
      const dlqEntry = JSON.stringify({
        merchantId,
        payload,
        failedAt: new Date().toISOString(),
      });
      await redis.rpush('webhook:dlq', dlqEntry);
      this.logger.warn(`Webhook DLQ entry stored for merchant ${merchantId}`);
    } catch (err) {
      this.logger.error(
        `Failed to store webhook DLQ entry for merchant ${merchantId}: ${(err as Error).message}`,
      );
    }
  }
}
