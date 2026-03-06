// ─── Type Definitions ─────────────────────────────────────────────────────────

export type CaseStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'ESCALATED';
export type CasePriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type DecisionAction = 'ALLOW' | 'REVIEW' | 'BLOCK';

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

export interface MockRiskFactor {
  signal: string;
  value: number | boolean | string;
  contribution: number;
  description: string;
}

export interface MockDecision {
  id: string;
  merchantId: string;
  entityId: string;
  action: DecisionAction;
  riskScore: number;
  createdAt: string;
}

// ─── Simple UUID replacement without crypto dependency ────────────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

// ─── Builder Functions ────────────────────────────────────────────────────────

export function buildMockCase(overrides: Partial<MockCase> = {}): MockCase {
  const now = new Date().toISOString();
  const slaDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  return {
    id: `case-${generateId()}`,
    merchantId: `merchant-${generateId()}`,
    decisionId: `dec-${generateId()}`,
    entityId: `user-${generateId()}`,
    action: 'REVIEW',
    riskScore: 55,
    riskFactors: [
      {
        signal: 'velocity_tx_count_1h',
        value: 8,
        contribution: 0.4,
        description: 'Elevated transaction count in last hour',
      },
    ],
    status: 'OPEN',
    priority: 'MEDIUM',
    slaDeadline,
    slaBreached: false,
    assignedTo: null,
    resolution: null,
    resolutionNotes: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function buildMockDecision(overrides: Partial<MockDecision> = {}): MockDecision {
  return {
    id: `dec-${generateId()}`,
    merchantId: `merchant-${generateId()}`,
    entityId: `user-${generateId()}`,
    action: 'REVIEW',
    riskScore: 55,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function mockAuthToken(): string {
  return 'mock-jwt-token';
}

export function buildMockRiskFactor(overrides: Partial<MockRiskFactor> = {}): MockRiskFactor {
  return {
    signal: 'test_signal',
    value: 1,
    contribution: 0.5,
    description: 'Test risk factor',
    ...overrides,
  };
}

export function buildHighRiskCase(overrides: Partial<MockCase> = {}): MockCase {
  return buildMockCase({
    action: 'BLOCK',
    riskScore: 90,
    priority: 'HIGH',
    status: 'OPEN',
    riskFactors: [
      {
        signal: 'device_emulator',
        value: true,
        contribution: 0.5,
        description: 'Device identified as emulator',
      },
      {
        signal: 'velocity_tx_count_1h',
        value: 25,
        contribution: 0.4,
        description: 'Very high transaction velocity',
      },
    ],
    ...overrides,
  });
}

export function buildResolvedCase(overrides: Partial<MockCase> = {}): MockCase {
  const resolvedAt = new Date().toISOString();
  return buildMockCase({
    status: 'RESOLVED',
    resolution: 'fraud_confirmed',
    resolutionNotes: 'Confirmed fraudulent activity',
    resolvedAt,
    assignedTo: 'analyst-01',
    ...overrides,
  });
}
