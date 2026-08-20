import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件'),
});

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordSchema>;
