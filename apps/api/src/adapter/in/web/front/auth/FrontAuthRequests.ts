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

export const frontRegisterSchema = z.object({
  email: z.string().trim().min(1).email().max(255),
  // 長度上限 128 是 bcrypt 的實務界線；複雜度由 PasswordPolicyService 判定，
  // 不在 schema 重寫一份——兩處規則不同步時，錯的那一份不會有人發現
  password: z.string().min(1).max(128),
  displayName: z.string().trim().min(1).max(50),
});

export type FrontRegisterRequest = z.infer<typeof frontRegisterSchema>;

/** 重發驗證信與忘記密碼共用：兩者都只吃一個信箱 */
export const frontEmailOnlySchema = z.object({
  email: z.string().trim().min(1).email().max(255),
});

export type FrontEmailOnlyRequest = z.infer<typeof frontEmailOnlySchema>;

export const frontResetPasswordSchema = z.object({
  token: z.string().min(1).max(255),
  password: z.string().min(1).max(128),
});

export type FrontResetPasswordRequest = z.infer<
  typeof frontResetPasswordSchema
>;

/** 驗證信連結的 query。token 由信件帶入，不是使用者輸入 */
export const verifyEmailQuerySchema = z.object({
  token: z.string().min(1).max(255),
});

export type VerifyEmailQuery = z.infer<typeof verifyEmailQuerySchema>;
