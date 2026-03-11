export type EntityType = 'customer' | 'device' | 'ip';

export interface VelocitySignal {
  entityId: string;
  merchantId: string;
  entityType?: EntityType;
  dimensions: {
    txCount10m: number;
    txCount1h: number;
    txCount24h: number;
    amountSum1h: number;
    amountSum24h: number;
    uniqueDevices24h: number;
    uniqueIps24h: number;
    uniqueSessions1h: number;
  };
  burstDetected: boolean;
  burstDimension?: string;
  burstRatio?: number;
}
