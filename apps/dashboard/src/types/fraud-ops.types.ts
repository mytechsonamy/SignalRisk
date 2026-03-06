export type CaseOutcome = 'fraud_confirmed' | 'false_positive' | 'inconclusive';

export interface LabeledCase {
  caseId: string;
  merchantId: string;
  outcome: CaseOutcome;
  labeledAt: string;
  analystId?: string;
}

export interface LabelingStats {
  today: {
    labeled: number;
    fraudConfirmed: number;
    falsePositives: number;
    inconclusive: number;
    accuracy: number; // fraudConfirmed / (fraudConfirmed + falsePositives)
  };
  pendingReview: number;
}
