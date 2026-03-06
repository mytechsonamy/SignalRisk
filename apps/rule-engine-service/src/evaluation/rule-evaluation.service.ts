import { Injectable, Logger } from '@nestjs/common';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { RuleRegistryService } from '../registry/rule-registry.service';
import { RuleEvaluator, SignalContext, EvaluationResult } from '../dsl/evaluator';
import { Action } from '../dsl/ast';

export interface RuleEvaluationSummary {
  matchedRules: EvaluationResult[];
  finalAction: Action;
  totalWeight: number;
  skippedRules: number;
}

@Injectable()
export class RuleEvaluationService {
  private readonly logger = new Logger(RuleEvaluationService.name);
  private readonly evaluator = new RuleEvaluator();
  private readonly tracer = trace.getTracer('rule-engine-service', '1.0.0');

  constructor(private readonly registry: RuleRegistryService) {}

  evaluate(context: SignalContext, merchantId: string): RuleEvaluationSummary {
    const rules = this.registry.getAll();
    const span = this.tracer.startSpan('rule-engine.evaluate', {
      attributes: {
        'rules.count': rules.length,
        'merchant.id': merchantId,
      },
    });

    try {
      const results = this.evaluator.evaluateAll(rules, context);

      const matchedRules = results.filter((r) => r.matched && !r.skipped);
      const skippedRules = results.filter((r) => r.skipped).length;

      let finalAction: Action = 'ALLOW';
      let totalWeight = 0;

      for (const result of matchedRules) {
        totalWeight += result.weight;

        // BLOCK has highest priority
        if (result.action === 'BLOCK') {
          finalAction = 'BLOCK';
        } else if (result.action === 'REVIEW' && finalAction !== 'BLOCK') {
          finalAction = 'REVIEW';
        }
      }

      this.logger.debug(
        `Evaluated ${rules.length} rules for merchant=${merchantId}: ` +
          `matched=${matchedRules.length}, skipped=${skippedRules}, action=${finalAction}`,
      );

      span.setAttribute('outcome', finalAction);
      span.setAttribute('rules.matched', matchedRules.length);
      span.setAttribute('rules.skipped', skippedRules);
      span.setAttribute(
        'rules.fired',
        matchedRules.map((r) => r.ruleId).join(','),
      );
      span.setStatus({ code: SpanStatusCode.OK });

      return { matchedRules, finalAction, totalWeight, skippedRules };
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
      throw err;
    } finally {
      span.end();
    }
  }
}
