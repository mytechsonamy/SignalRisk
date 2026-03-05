export interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'analyst' | 'viewer';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ServiceHealth {
  name: string;
  port: number;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number | null;
  lastChecked: string;
}

export interface Rule {
  id: string;
  name: string;
  expression: string; // DSL expression e.g. "trustScore < 30 AND velocity > 100"
  outcome: 'ALLOW' | 'REVIEW' | 'BLOCK';
  weight: number; // 0.1 - 1.0
  isActive: boolean;
}

export interface AdminState {
  users: AdminUser[];
  services: ServiceHealth[];
  rules: Rule[];
  isLoadingUsers: boolean;
  isLoadingServices: boolean;
  isLoadingRules: boolean;
  error: string | null;
}
