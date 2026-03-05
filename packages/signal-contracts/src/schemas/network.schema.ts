import { z } from 'zod';

export const NetworkSignalSchema = z.object({
  ip: z.string(),
  merchantId: z.string(),
  country: z.string().optional(),
  city: z.string().optional(),
  asn: z.string().optional(),
  isProxy: z.boolean(),
  isVpn: z.boolean(),
  isTor: z.boolean(),
  isDatacenter: z.boolean(),
  geoMismatchScore: z.number().min(0).max(100),
  riskScore: z.number().min(0).max(100),
});

export type NetworkSignalDto = z.infer<typeof NetworkSignalSchema>;
