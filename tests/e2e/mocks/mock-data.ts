// Shared mock data — importable without MSW (safe for Jest in Node/CJS mode)

export type CaseStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'ESCALATED';
export type CasePriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type DecisionAction = 'ALLOW' | 'REVIEW' | 'BLOCK';

export interface MockRiskFactor {
  signal: string;
  value: number | boolean | string;
  contribution: number;
  description: string;
}

export interface MockCase {
  id: string;
  merchantId: string;
  decisionId: string;
  entityId: string;
  action: DecisionAction;
  riskScore: number;
  riskFactors: MockRiskFactor[];
  status: CaseStatus;
  priority: CasePriority;
  slaDeadline: string;
  slaBreached: boolean;
  assignedTo: string | null;
  resolution: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MockDecision {
  id: string;
  merchantId: string;
  entityId: string;
  action: DecisionAction;
  riskScore: number;
  createdAt: string;
}

export const mockCases: MockCase[] = [
  {
    id: 'case-001',
    merchantId: 'merchant-abc',
    decisionId: 'dec-001',
    entityId: 'user-xyz',
    action: 'BLOCK',
    riskScore: 87,
    riskFactors: [
      {
        signal: 'velocity_tx_count_1h',
        value: 15,
        contribution: 0.45,
        description: 'High transaction count in last hour',
      },
      {
        signal: 'device_emulator',
        value: true,
        contribution: 0.30,
        description: 'Device identified as emulator',
      },
    ],
    status: 'OPEN',
    priority: 'HIGH',
    slaDeadline: '2026-03-07T12:00:00.000Z',
    slaBreached: false,
    assignedTo: null,
    resolution: null,
    resolutionNotes: null,
    resolvedAt: null,
    createdAt: '2026-03-06T08:00:00.000Z',
    updatedAt: '2026-03-06T08:00:00.000Z',
  },
  {
    id: 'case-002',
    merchantId: 'merchant-abc',
    decisionId: 'dec-002',
    entityId: 'user-qrs',
    action: 'REVIEW',
    riskScore: 54,
    riskFactors: [
      {
        signal: 'ip_reputation',
        value: 'suspicious',
        contribution: 0.35,
        description: 'IP address flagged by threat intelligence',
      },
    ],
    status: 'IN_REVIEW',
    priority: 'MEDIUM',
    slaDeadline: '2026-03-07T18:00:00.000Z',
    slaBreached: false,
    assignedTo: 'analyst-01',
    resolution: null,
    resolutionNotes: null,
    resolvedAt: null,
    createdAt: '2026-03-06T09:30:00.000Z',
    updatedAt: '2026-03-06T10:15:00.000Z',
  },
];

export const mockDecisions: MockDecision[] = [
  {
    id: 'dec-001',
    merchantId: 'merchant-abc',
    entityId: 'user-xyz',
    action: 'BLOCK',
    riskScore: 87,
    createdAt: '2026-03-06T08:00:00.000Z',
  },
  {
    id: 'dec-002',
    merchantId: 'merchant-abc',
    entityId: 'user-qrs',
    action: 'REVIEW',
    riskScore: 54,
    createdAt: '2026-03-06T09:30:00.000Z',
  },
];

// Handler route registry — describes all API routes without importing MSW
// Allows Jest tests to verify route coverage without ESM dependency issues
export const handlerRoutes: Array<{ method: string; path: string }> = [
  { method: 'POST', path: '/v1/auth/login' },
  { method: 'POST', path: '/v1/auth/logout' },
  { method: 'POST', path: '/v1/auth/refresh' },
  { method: 'GET', path: '/v1/cases' },
  { method: 'GET', path: '/v1/cases/:id' },
  { method: 'PATCH', path: '/v1/cases/:id' },
  { method: 'POST', path: '/v1/cases/bulk' },
  { method: 'POST', path: '/v1/chargebacks' },
  { method: 'GET', path: '/v1/analytics/risk-scores' },
  { method: 'GET', path: '/v1/analytics/decisions' },
  { method: 'GET', path: '/v1/analytics/trends' },
  { method: 'GET', path: '/v1/flags/:name/check' },
  { method: 'GET', path: '/health' },
];
