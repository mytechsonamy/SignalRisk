export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  merchantIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FlagCheckResult {
  flagName: string;
  merchantId: string;
  enabled: boolean;
  reason: 'disabled' | 'allowlist' | 'rollout' | 'full_rollout' | 'not_found';
}

export interface CreateFlagDto {
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  merchantIds: string[];
}

export interface UpdateFlagDto {
  description?: string;
  enabled?: boolean;
  rolloutPercentage?: number;
  merchantIds?: string[];
}
