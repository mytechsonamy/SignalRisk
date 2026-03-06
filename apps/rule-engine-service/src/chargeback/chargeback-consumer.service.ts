import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { ChargebackEvent } from './chargeback.types';
import { RuleWeightAdjustmentService } from './rule-weight-adjustment.service';
import { WeightAuditService } from './weight-audit.service';

@Injectable()
export class ChargebackConsumerService implements OnModuleInit {
  private readonly logger = new Logger(ChargebackConsumerService.name);
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;

  constructor(
    private readonly weightAdjustmentService: RuleWeightAdjustmentService,
    private readonly weightAuditService: WeightAuditService,
  ) {
    this.kafka = new Kafka({
      clientId: 'rule-engine-service',
      brokers: [(process.env.KAFKA_BROKER ?? 'localhost:9092')],
    });
    this.consumer = this.kafka.consumer({ groupId: 'rule-engine-chargebacks' });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topic: 'chargebacks', fromBeginning: false });
      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });
      this.logger.log('Chargeback consumer started, listening on topic: chargebacks');
    } catch (err) {
      this.logger.error('Failed to start chargeback consumer', err);
    }
  }

  async processEvent(event: ChargebackEvent): Promise<void> {
    this.logger.debug(
      `Processing chargeback event: caseId=${event.caseId} outcome=${event.outcome} rules=${event.firedRuleIds.length}`,
    );

    const adjustments = await this.weightAdjustmentService.adjustWeightsForChargeback(event);

    for (const adjustment of adjustments) {
      try {
        await this.weightAuditService.logAdjustment(adjustment);
      } catch (auditErr) {
        this.logger.error(
          `Failed to log audit for rule=${adjustment.ruleId} case=${adjustment.caseId}`,
          auditErr,
        );
      }
    }

    this.logger.log(
      `Processed chargeback caseId=${event.caseId}: adjusted ${adjustments.length} rule weights`,
    );
  }

  async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;
    try {
      const raw = message.value?.toString();
      if (!raw) {
        this.logger.warn('Received empty chargeback message, skipping');
        return;
      }

      const event: ChargebackEvent = JSON.parse(raw);
      await this.processEvent(event);
    } catch (err) {
      this.logger.error('Error processing chargeback message', err);
      // Never throw - consumer must continue processing
    }
  }
}
