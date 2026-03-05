import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaseRepository } from '../cases/case.repository';
import { SlaAlertService } from './sla-alert.service';
import { SlaBreachEvent } from './sla.types';

@Injectable()
export class SlaMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaMonitorService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private readonly checkIntervalMs: number;

  constructor(
    private readonly caseRepository: CaseRepository,
    private readonly slaAlertService: SlaAlertService,
    private readonly configService: ConfigService,
  ) {
    this.checkIntervalMs = Number(
      this.configService.get('SLA_CHECK_INTERVAL_MS', 5 * 60 * 1000),
    );
  }

  onModuleInit(): void {
    this.intervalHandle = setInterval(
      () => void this.checkBreaches(),
      this.checkIntervalMs,
    );
    this.logger.log(
      `SLA monitor started, checking every ${this.checkIntervalMs}ms`,
    );
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async checkBreaches(): Promise<SlaBreachEvent[]> {
    const breachedCases = await this.caseRepository.findBreachedCases();
    const results: SlaBreachEvent[] = [];

    for (const c of breachedCases) {
      try {
        await this.caseRepository.markSlaBreached(c.id);
      } catch (err) {
        this.logger.error(
          `Failed to mark SLA breach for case ${c.id}: ${(err as Error).message}`,
        );
        continue;
      }

      const breach: SlaBreachEvent = {
        caseId: c.id,
        merchantId: c.merchantId,
        priority: c.priority,
        slaDeadline: c.slaDeadline,
        breachedAt: new Date(),
        outcome: c.action,
        riskScore: c.riskScore,
      };

      try {
        await this.slaAlertService.sendAlert(breach);
      } catch (err) {
        this.logger.error(
          `Failed to send SLA alert for case ${c.id}: ${(err as Error).message}`,
        );
      }

      results.push(breach);
    }

    return results;
  }
}
