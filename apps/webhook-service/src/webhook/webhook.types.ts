export interface WebhookConfig {
  merchantId: string;
  url: string;
  secret: string; // HMAC secret
}

export interface DecisionEvent {
  requestId: string;
  merchantId: string;
  outcome: 'ALLOW' | 'REVIEW' | 'BLOCK';
  riskScore: number;
  timestamp: string;
  signals: Record<string, unknown>;
}

export interface WebhookPayload {
  event: 'decision.block' | 'decision.review' | 'case.sla_breach';
  requestId: string;
  merchantId: string;
  outcome: string;
  riskScore: number;
  timestamp: string | Date;
}
