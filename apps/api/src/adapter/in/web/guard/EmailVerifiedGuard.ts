import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { EmailNotVerifiedException } from '@app/domain/exception/EmailNotVerifiedException';

/**
 * 前台的信箱驗證門檻。
 *
 * **必須掛在 `FrontJwtAuthGuard` 之後**——它讀的 `request.frontUser` 由前者設定。
 * Nest 依 `@UseGuards()` 的宣告順序執行，因此順序不是風格問題。
 *
 * **這道檢查刻意集中在一個 Guard，而不是散在各 use case 裡。**
 * 散開的話漏掉一支就是一個洞，而那個洞不會有任何徵兆——端點看起來完全正常，
 * 只是對未驗證的帳號也開放。`authorization-coverage.spec.ts` 有一條守則
 * 要求前台受保護的 controller 掛它，豁免需明列。
 *
 * **不擋 `/api/front/me`**：使用者要看得到自己的驗證狀態才知道卡在哪。
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // frontUser 不存在代表這支端點漏掛了 FrontJwtAuthGuard。
    // 這裡選擇擋下而非放行：兩個 Guard 的順序寫錯時，安全的預設是拒絕
    if (!request.frontUser?.emailVerified) {
      throw new EmailNotVerifiedException();
    }
    return true;
  }
}
