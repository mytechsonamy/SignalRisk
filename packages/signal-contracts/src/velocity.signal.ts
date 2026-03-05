export interface VelocitySignal {
  entityId: string;
  merchantId: string;
  dimensions: {
    txCount1h: number;
    txCount24h: number;
    amountSum1h: number;
    uniqueDevices24h: number;
    uniqueIps24h: number;
    uniqueSessions1h: number;
  };
  burstDetected: boolean;
  burstDimension?: string;
  burstRatio?: number;
}
