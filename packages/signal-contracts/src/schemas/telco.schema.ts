import { z } from 'zod';

export const TelcoSignalSchema = z.object({
  msisdn: z.string(),
  merchantId: z.string(),
  operator: z.string().optional(),
  lineType: z.enum(['prepaid', 'postpaid', 'unknown']).optional(),
  isPorted: z.boolean(),
  portDate: z.date().optional(),
  prepaidProbability: z.number().min(0).max(1),
  countryCode: z.string().optional(),
});

export type TelcoSignalDto = z.infer<typeof TelcoSignalSchema>;
