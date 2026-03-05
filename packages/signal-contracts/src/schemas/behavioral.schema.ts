import { z } from 'zod';

export const BehavioralSignalSchema = z.object({
  sessionId: z.string(),
  merchantId: z.string(),
  sessionRiskScore: z.number().min(0).max(100),
  botProbability: z.number().min(0).max(1),
  isBot: z.boolean(),
  indicators: z.array(z.string()),
  timingCv: z.number().optional(),
  navigationEntropy: z.number().optional(),
});

export type BehavioralSignalDto = z.infer<typeof BehavioralSignalSchema>;
