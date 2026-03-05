export interface ChargebackEvent {
  caseId: string;
  merchantId: string;
  decisionId: string;
  firedRuleIds: string[]; // rule IDs that contributed to this decision
  outcome: 'fraud_confirmed' | 'false_positive';
  amount: number;
  currency: string;
  timestamp: string;
}

export interface WeightAdjustment {
  ruleId: string;
  oldWeight: number;
  newWeight: number;
  reason: 'fraud_confirmed' | 'false_positive';
  caseId: string;
  timestamp: Date;
}
