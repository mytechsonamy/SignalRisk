import { z } from 'zod';

export const DeviceSignalSchema = z.object({
  deviceId: z.string(),
  merchantId: z.string(),
  fingerprint: z.string(),
  trustScore: z.number().min(0).max(100),
  isEmulator: z.boolean(),
  emulatorConfidence: z.number().min(0).max(1),
  platform: z.enum(['web', 'android', 'ios']),
  firstSeenAt: z.date(),
  lastSeenAt: z.date(),
  daysSinceFirstSeen: z.number(),
});

export type DeviceSignalDto = z.infer<typeof DeviceSignalSchema>;
