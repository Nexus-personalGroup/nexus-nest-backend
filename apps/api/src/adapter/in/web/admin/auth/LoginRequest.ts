import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件'),
  password: z.string().min(1, '密碼不可為空'),
  recaptchaToken: z.string().optional(),
});

export type LoginRequest = z.infer<typeof loginSchema>;
