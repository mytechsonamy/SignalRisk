import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ChargebackEvent, WeightAdjustment } from './chargeback.types';

const WEIGHT_KEY_PREFIX = 'rule:weight:';
const DEFAULT_WEIGHT = 1.0;
const FRAUD_CONFIRMED_DELTA = 0.05;
const FALSE_POSITIVE_DELTA = -0.03;
const MAX_WEIGHT = 1.0;
const MIN_WEIGHT = 0.1;

@Injectable()
export class RuleWeightAdjustmentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RuleWeightAdjustmentService.name);
  private redis: Redis;

  onModuleInit(): void {
    this.redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    });
    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error', err);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async getWeight(ruleId: string): Promise<number> {
    const key = `${WEIGHT_KEY_PREFIX}${ruleId}`;
    const value = await this.redis.get(key);
    if (value === null) {
      return DEFAULT_WEIGHT;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? DEFAULT_WEIGHT : parsed;
  }

  async adjustWeight(
    ruleId: string,
    outcome: 'fraud_confirmed' | 'false_positive',
  ): Promise<{ oldWeight: number; newWeight: number }> {
    const oldWeight = await this.getWeight(ruleId);
    const delta = outcome === 'fraud_confirmed' ? FRAUD_CONFIRMED_DELTA : FALSE_POSITIVE_DELTA;
    const raw = oldWeight + delta;
    const newWeight = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, raw));

    const key = `${WEIGHT_KEY_PREFIX}${ruleId}`;
    await this.redis.set(key, newWeight.toString());

    this.logger.debug(
      `Adjusted weight for rule=${ruleId} outcome=${outcome}: ${oldWeight} -> ${newWeight}`,
    );

    return { oldWeight, newWeight };
  }

  async adjustWeightsForChargeback(event: ChargebackEvent): Promise<WeightAdjustment[]> {
    const adjustments: WeightAdjustment[] = [];

    for (const ruleId of event.firedRuleIds) {
      const { oldWeight, newWeight } = await this.adjustWeight(ruleId, event.outcome);
      adjustments.push({
        ruleId,
        oldWeight,
        newWeight,
        reason: event.outcome,
        caseId: event.caseId,
        timestamp: new Date(),
      });
    }

    return adjustments;
  }
}
