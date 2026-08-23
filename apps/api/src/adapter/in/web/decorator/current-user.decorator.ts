import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { UserContext } from '@app/application/port/user-context';

/**
 * 取出目前登入的**前台使用者**。
 *
 * 與 `@CurrentMember()` 是兩個不同的裝飾器，不共用——
 * 兩側的上下文形狀不同，共用會讓讀取端得先判斷「這是哪一側的」。
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    // frontUser 由 FrontJwtAuthGuard 保證設定；該 Guard 失敗時請求不會到達此處
    if (!request.frontUser) {
      throw new Error('UserContext 未設定，請確認 FrontJwtAuthGuard 已套用');
    }
    return request.frontUser;
  },
);
