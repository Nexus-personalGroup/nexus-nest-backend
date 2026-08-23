import { z } from 'zod';

/**
 * 已通過認證的前台使用者上下文
 *
 * **與 `MemberContext` 平行而非繼承。** 後者帶 `roleName` / `roleCode` / `permissions`——
 * 全是 RBAC 概念，而前台使用者沒有角色也沒有權限碼。硬塞空陣列會讓
 * 「permissions 是空的」同時代表「沒有權限」與「這個概念不適用」。
 *
 * 兩者碰巧有幾個同名欄位，但那是巧合不是抽象。
 */
export interface UserContext {
  sub: string;
  email: string;
  displayName: string;
  /** 帳號啟用狀態（false 時 Guard 會拒絕請求） */
  status: boolean;
  /**
   * 信箱是否已驗證。**每次請求重新解析，不快取在 token 裡**——
   * 快取的話使用者驗證完還得重新登入才能聊天。
   */
  emailVerified: boolean;
  /** token 版本（refresh 重用連坐撤銷用） */
  tokenVersion?: number;
}

/** 供日後快取反序列化用的執行期驗證；形狀變動時不靜默失效 */
export const UserContextSchema = z.object({
  sub: z.string(),
  email: z.string(),
  displayName: z.string(),
  status: z.boolean(),
  emailVerified: z.boolean(),
  tokenVersion: z.number().optional(),
});
