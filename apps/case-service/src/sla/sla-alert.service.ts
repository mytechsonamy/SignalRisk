import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SlaBreachEvent } from './sla.types';

@Injectable()
export class SlaAlertService {
  private readonly logger = new Logger(SlaAlertService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendAlert(breach: SlaBreachEvent): Promise<void> {
    const webhookServiceUrl = this.configService.get(
      'WEBHOOK_SERVICE_URL',
      'http://localhost:3011',
    );
    const url = `${webhookServiceUrl}/internal/sla-breach`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(breach),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        this.logger.warn(
          `SLA breach alert returned status ${response.status} for case ${breach.caseId}`,
        );
      } else {
        this.logger.log(`SLA breach alert sent for case ${breach.caseId}`);
      }
    } catch (err) {
      this.logger.error(
        `Failed to send SLA breach alert for case ${breach.caseId}: ${(err as Error).message}`,
      );
    }
  }
}
