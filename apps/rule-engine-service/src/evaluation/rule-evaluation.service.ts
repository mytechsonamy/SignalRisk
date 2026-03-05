import { Injectable, Logger } from '@nestjs/common';
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

  constructor(private readonly registry: RuleRegistryService) {}

  evaluate(context: SignalContext, merchantId: string): RuleEvaluationSummary {
    const rules = this.registry.getAll();
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

    return { matchedRules, finalAction, totalWeight, skippedRules };
  }
}
