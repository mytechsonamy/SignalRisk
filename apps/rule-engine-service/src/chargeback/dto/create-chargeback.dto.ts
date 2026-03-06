export class CreateChargebackDto {
  caseId: string;
  merchantId: string;
  decisionId?: string;
  firedRuleIds: string[];
  outcome: 'fraud_confirmed' | 'false_positive';
  amount: number;
  currency?: string;
}
