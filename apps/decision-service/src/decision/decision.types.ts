export type DecisionAction = 'ALLOW' | 'REVIEW' | 'BLOCK';

export interface DecisionRequest {
  requestId: string;      // idempotency key
  merchantId: string;
  deviceId?: string;
  sessionId?: string;
  entityId: string;       // userId or transactionId — used for velocity lookup
  ip?: string;
  msisdn?: string;
  billingCountry?: string;
  amount?: number;
}

export interface RiskFactor {
  signal: string;         // e.g. 'device.trustScore'
  value: number | boolean | string;
  contribution: number;   // 0-100, how much this factor contributed
  description: string;
}

export interface DecisionResult {
  requestId: string;
  merchantId: string;
  action: DecisionAction;
  riskScore: number;      // 0-100
  riskFactors: RiskFactor[];
  appliedRules: string[]; // rule IDs that matched
  latencyMs: number;
  cached: boolean;        // true if served from idempotency cache
  createdAt: Date;
  isTest?: boolean;       // true for events sent with X-SignalRisk-Test header
}
