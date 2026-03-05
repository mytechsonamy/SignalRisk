export type Action = 'BLOCK' | 'REVIEW' | 'ALLOW';
export type MissingPolicy = 'SKIP' | 'DEFAULT_HIGH' | 'DEFAULT_LOW';
export type Operator = '>' | '>=' | '<' | '<=' | '==' | '!=' | 'IN' | 'NOT_IN';
export type LogicalOp = 'AND' | 'OR';

export interface RuleNode {
  type: 'rule';
  id: string;
  condition: ExpressionNode;
  action: Action;
  weight: number;           // default 1.0
  missingPolicy: MissingPolicy; // default 'SKIP'
}

export interface ComparisonNode {
  type: 'comparison';
  field: string;            // e.g. 'device.trustScore'
  operator: Operator;
  value: number | string | boolean | (number | string)[];
}

export interface LogicalNode {
  type: 'logical';
  op: LogicalOp;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface NotNode {
  type: 'not';
  operand: ExpressionNode;
}

export type ExpressionNode = ComparisonNode | LogicalNode | NotNode;
