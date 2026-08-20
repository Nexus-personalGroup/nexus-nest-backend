import { z } from 'zod';

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token 不可為空'),
  newPassword: z.string().min(1, '新密碼不可為空'),
});

export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;
