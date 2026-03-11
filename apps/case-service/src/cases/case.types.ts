export type CaseStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'ESCALATED';
export type CasePriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type CaseResolution = 'FRAUD' | 'LEGITIMATE' | 'INCONCLUSIVE';

export interface RiskFactor {
  signal: string;
  value: number | boolean | string;
  contribution: number;
  description: string;
}

export interface Case {
  id: string;
  merchantId: string;
  decisionId: string;       // requestId from decision-service
  entityId: string;
  entityType?: 'customer' | 'device' | 'ip';
  action: 'REVIEW' | 'BLOCK';
  riskScore: number;
  riskFactors: RiskFactor[];
  status: CaseStatus;
  priority: CasePriority;
  slaDeadline: Date;        // BLOCK=4h from creation, REVIEW=24h
  slaBreached: boolean;      // true when SLA deadline has been exceeded
  assignedTo: string | null;
  resolution: CaseResolution | null;
  resolutionNotes: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCaseData {
  merchantId: string;
  decisionId: string;
  entityId: string;
  entityType?: 'customer' | 'device' | 'ip';
  action: 'REVIEW' | 'BLOCK';
  riskScore: number;
  riskFactors: RiskFactor[];
  status: CaseStatus;
  priority: CasePriority;
  slaDeadline: Date;
}

export interface UpdateCaseData {
  status?: CaseStatus;
  assignedTo?: string | null;
  resolution?: CaseResolution | null;
  resolutionNotes?: string | null;
  resolvedAt?: Date | null;
}

export interface CaseListParams {
  merchantId: string;
  status?: CaseStatus;
  priority?: CasePriority;
  assignedTo?: string;
  search?: string;     // search by entityId
  slaBreached?: boolean;
  page: number;        // 1-based
  limit: number;       // max 100
}

export interface DecisionEvent {
  requestId: string;
  merchantId: string;
  entityId: string;
  entityType?: 'customer' | 'device' | 'ip';
  action: 'ALLOW' | 'REVIEW' | 'BLOCK';
  riskScore: number;
  riskFactors: RiskFactor[];
  timestamp?: string;
}
