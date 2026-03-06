export type CaseStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'ESCALATED';
export type CasePriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type DecisionAction = 'REVIEW' | 'BLOCK';

export interface EvidenceItem {
  timestamp: string;          // ISO datetime
  type: string;               // e.g. 'signal', 'rule_hit', 'user_action'
  description: string;
  data?: Record<string, unknown>;
}

export interface Case {
  id: string;
  merchantId: string;
  decisionId: string;
  entityId: string;
  action: DecisionAction;
  riskScore: number;
  riskFactors: RiskFactor[];
  evidenceTimeline?: EvidenceItem[];
  status: CaseStatus;
  priority: CasePriority;
  slaDeadline: string;        // ISO datetime
  slaBreached?: boolean;
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
