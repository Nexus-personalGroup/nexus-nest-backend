import { z } from 'zod';

export const frontLoginSchema = z.object({
  email: z.string().trim().min(1).email().max(255),
  password: z.string().min(1).max(128),
});

export type FrontLoginRequest = z.infer<typeof frontLoginSchema>;

export const frontRefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type FrontRefreshRequest = z.infer<typeof frontRefreshSchema>;
