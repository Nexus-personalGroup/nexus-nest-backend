import { z } from 'zod';

export const unlockAccountSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件'),
});

export type UnlockAccountRequest = z.infer<typeof unlockAccountSchema>;
