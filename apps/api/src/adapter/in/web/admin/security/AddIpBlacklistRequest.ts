import { z } from 'zod';
import { ipSchema } from './ip-schema';

export const addIpBlacklistSchema = z.object({
  ip: ipSchema,
  reason: z.string().optional(),
});

export type AddIpBlacklistRequest = z.infer<typeof addIpBlacklistSchema>;
