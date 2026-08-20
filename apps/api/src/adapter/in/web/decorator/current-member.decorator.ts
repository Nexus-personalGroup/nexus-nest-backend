import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { z } from 'zod';
import { Request } from 'express';

/** 請求上下文中的完整會員資訊（由 JwtAuthGuard 查 DB 後掛上） */
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

export const CurrentMember = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): MemberContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    // member 由 JwtAuthGuard 保證設定；該 Guard 失敗時請求不會到達此處
    if (!request.member) {
      throw new Error('MemberContext 未設定，請確認 JwtAuthGuard 已套用');
    }
    return request.member;
  },
);
