import { z } from 'zod';

/**
 * 已通過認證的會員上下文
 *
 * 放在 application/port 而非 adapter：它是「這個請求 / 連線背後是誰」的概念，
 * 與傳輸方式無關。HTTP 與 WebSocket 兩條路徑解析出來的是同一個東西，
 * 定義若留在 HTTP 那側，另一側就得反向相依 adapter 層。
 */
export interface MemberContext {
  sub: string;
  email: string;
  /** 角色顯示名（給 UI 用，如「管理者」） */
  roleName: string;
  /** 角色代碼（給 Guard / 權限判斷用，如 SUPERADMIN） */
  roleCode: string;
  permissions: string[];
  /** 帳號啟用狀態（false 時 Guard 會拒絕請求） */
  status: boolean;
  /** token 版本（refresh 重用連坐撤銷用） */
  tokenVersion?: number;
  lastPasswordChange?: string | null;
}

/** 用於 Redis 快取反序列化的執行期 shape 驗證，避免快取格式過時時靜默失效 */
export const MemberContextSchema = z.object({
  sub: z.string(),
  email: z.string(),
  roleName: z.string(),
  roleCode: z.string(),
  permissions: z.array(z.string()),
  status: z.boolean(),
  tokenVersion: z.number().optional(),
  lastPasswordChange: z.string().nullable().optional(),
});
