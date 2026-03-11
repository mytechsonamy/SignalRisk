import { z } from 'zod';

export const VelocitySignalSchema = z.object({
  entityId: z.string(),
  merchantId: z.string(),
  entityType: z.enum(['customer', 'device', 'ip']).optional(),
  dimensions: z.object({
    txCount10m: z.number(),
    txCount1h: z.number(),
    txCount24h: z.number(),
    amountSum1h: z.number(),
    amountSum24h: z.number(),
    uniqueDevices24h: z.number(),
    uniqueIps24h: z.number(),
    uniqueSessions1h: z.number(),
  }),
  burstDetected: z.boolean(),
  burstDimension: z.string().optional(),
  burstRatio: z.number().optional(),
});

export type VelocitySignalDto = z.infer<typeof VelocitySignalSchema>;
