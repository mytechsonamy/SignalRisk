export class SlaBreachDto {
  caseId!: string;
  merchantId!: string;
  priority!: 'HIGH' | 'MEDIUM' | 'LOW';
  slaDeadline!: string;
  breachedAt!: string;
  outcome!: string;
  riskScore!: number;
}
