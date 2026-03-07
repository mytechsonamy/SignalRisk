import type { DeviceSignal, VelocitySignal, BehavioralSignal, NetworkSignal, TelcoSignal } from '@signalrisk/signal-contracts';
import {
  RuleNode,
  ExpressionNode,
  ComparisonNode,
  LogicalNode,
  NotNode,
  Action,
  MissingPolicy,
} from './ast';

export interface SignalContext {
  device?: Partial<DeviceSignal>;
  velocity?: Partial<VelocitySignal>;
  behavioral?: Partial<BehavioralSignal>;
  network?: Partial<NetworkSignal>;
  telco?: Partial<TelcoSignal>;
}

export interface EvaluationResult {
  ruleId: string;
  matched: boolean;
  action: Action;
  weight: number;
  skipped: boolean; // true when missingPolicy=SKIP and field was absent
}

/**
 * Sentinel to indicate a missing field was encountered.
 */
const MISSING = Symbol('MISSING');

type FieldValue = number | string | boolean | (number | string)[] | typeof MISSING;

/**
 * Resolve a dotted field path like 'device.trustScore' against a SignalContext.
 * Returns the MISSING sentinel if the field path is undefined/null.
 */
function resolveField(field: string, context: SignalContext): FieldValue {
  const parts = field.split('.');
  if (parts.length < 2) return MISSING;

  const [prefix, ...rest] = parts;
  const signal = (context as Record<string, unknown>)[prefix];
  if (signal == null) return MISSING;

  let current: unknown = signal;
  for (const part of rest) {
    if (current == null || typeof current !== 'object') return MISSING;
    current = (current as Record<string, unknown>)[part];
  }

  if (current == null) return MISSING;
  return current as FieldValue;
}

/**
 * Apply missing policy to produce a default value for a field.
 */
function applyMissingDefault(
  missingPolicy: MissingPolicy,
  comparisonValue: number | string | boolean | (number | string)[],
): FieldValue {
  if (missingPolicy === 'DEFAULT_HIGH') {
    if (typeof comparisonValue === 'boolean') return true;
    return 999999;
  }
  if (missingPolicy === 'DEFAULT_LOW') {
    if (typeof comparisonValue === 'boolean') return false;
    return 0;
  }
  return MISSING;
}

function compareValues(
  fieldVal: FieldValue,
  operator: string,
  ruleVal: number | string | boolean | (number | string)[],
): boolean {
  if (fieldVal === MISSING) return false;

  switch (operator) {
    case '>':
      return (fieldVal as number) > (ruleVal as number);
    case '>=':
      return (fieldVal as number) >= (ruleVal as number);
    case '<':
      return (fieldVal as number) < (ruleVal as number);
    case '<=':
      return (fieldVal as number) <= (ruleVal as number);
    case '==':
      return fieldVal === ruleVal;
    case '!=':
      return fieldVal !== ruleVal;
    case 'IN': {
      const list = ruleVal as (number | string)[];
      return list.includes(fieldVal as number | string);
    }
    case 'NOT_IN': {
      const list = ruleVal as (number | string)[];
      return !list.includes(fieldVal as number | string);
    }
    default:
      return false;
  }
}

export class RuleEvaluator {
  /**
   * Evaluate a single expression node against the context.
   * Returns [matched, wasMissing] where wasMissing indicates a SKIP-able missing field.
   */
  private evaluateExpression(
    node: ExpressionNode,
    context: SignalContext,
    missingPolicy: MissingPolicy,
  ): { result: boolean; wasMissing: boolean } {
    switch (node.type) {
      case 'comparison': {
        return this.evaluateComparison(
          node as ComparisonNode,
          context,
          missingPolicy,
        );
      }
      case 'logical': {
        const logical = node as LogicalNode;
        const left = this.evaluateExpression(
          logical.left,
          context,
          missingPolicy,
        );
        const right = this.evaluateExpression(
          logical.right,
          context,
          missingPolicy,
        );

        if (logical.op === 'AND') {
          return {
            result: left.result && right.result,
            wasMissing: left.wasMissing || right.wasMissing,
          };
        } else {
          // OR
          return {
            result: left.result || right.result,
            wasMissing: left.wasMissing && right.wasMissing,
          };
        }
      }
      case 'not': {
        const notNode = node as NotNode;
        const inner = this.evaluateExpression(
          notNode.operand,
          context,
          missingPolicy,
        );
        return { result: !inner.result, wasMissing: inner.wasMissing };
      }
    }
  }

  private evaluateComparison(
    node: ComparisonNode,
    context: SignalContext,
    missingPolicy: MissingPolicy,
  ): { result: boolean; wasMissing: boolean } {
    let fieldVal = resolveField(node.field, context);

    if (fieldVal === MISSING) {
      if (missingPolicy === 'SKIP') {
        return { result: false, wasMissing: true };
      }
      // Apply default value
      fieldVal = applyMissingDefault(missingPolicy, node.value);
      if (fieldVal === MISSING) {
        return { result: false, wasMissing: true };
      }
    }

    const matched = compareValues(fieldVal, node.operator, node.value);
    return { result: matched, wasMissing: false };
  }

  /**
   * Evaluate a single rule against a signal context.
   */
  evaluate(rule: RuleNode, context: SignalContext): EvaluationResult {
    const { result, wasMissing } = this.evaluateExpression(
      rule.condition,
      context,
      rule.missingPolicy,
    );

    if (wasMissing && rule.missingPolicy === 'SKIP') {
      return {
        ruleId: rule.id,
        matched: false,
        action: rule.action,
        weight: rule.weight,
        skipped: true,
      };
    }

    return {
      ruleId: rule.id,
      matched: result,
      action: rule.action,
      weight: rule.weight,
      skipped: false,
    };
  }

  /**
   * Evaluate all rules against a signal context.
   */
  evaluateAll(rules: RuleNode[], context: SignalContext): EvaluationResult[] {
    return rules.map((rule) => this.evaluate(rule, context));
  }
}
