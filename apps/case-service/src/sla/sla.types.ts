export interface SlaBreachEvent {
  caseId: string;
  merchantId: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  slaDeadline: Date;
  breachedAt: Date;
  outcome: string; // BLOCK or REVIEW
  riskScore: number;
}
