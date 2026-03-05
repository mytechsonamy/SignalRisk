export interface Merchant {
  id: string; // UUID
  name: string;
  apiKeyHash: string; // bcrypt hash of API key
  apiKeyPrefix: string; // first 8 chars for identification
  webhookUrl?: string;
  rateLimitPerMinute: number; // default 1000
  tier: 'default' | 'burst';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date; // soft delete
}
