export type CaseStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'ESCALATED';
export type CasePriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type DecisionAction = 'REVIEW' | 'BLOCK';

export interface Case {
  id: string;
  merchantId: string;
  decisionId: string;
  entityId: string;
  action: DecisionAction;
  riskScore: number;
  riskFactors: RiskFactor[];
  status: CaseStatus;
  priority: CasePriority;
  slaDeadline: string;        // ISO datetime
  assignedTo: string | null;
  resolution: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RiskFactor {
  signal: string;
  value: number | boolean | string;
  contribution: number;
  description: string;
}

export interface CaseListResponse {
  cases: Case[];
  total: number;
  page: number;
  limit: number;
}
