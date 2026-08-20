import { z } from 'zod';
import { ipSchema } from './ip-schema';

export const addIpWhitelistSchema = z.object({
  ip: ipSchema,
  description: z.string().optional(),
});

export type AddIpWhitelistRequest = z.infer<typeof addIpWhitelistSchema>;
