import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  RESOLVE_USER_CONTEXT_USE_CASE,
  ResolveUserContextUseCase,
} from '@app/application/port/in/front/auth/FrontAuthUseCases';
/**
 * 前台的認證 Guard。
 *
 * 與後台的 `JwtAuthGuard` **平行而非共用**：後者解析出的是帶角色與權限碼的
 * `MemberContext`，前台沒有那些東西。共用一支再用參數分流，
 * 會讓「前台要不要查權限」這種問題每次都要重新想一遍。
 *
 * **本 Guard 刻意不檢查 `@Public()`。** 掛它的 controller 同時帶著 `@Public()`——
 * 那個標記是給**全域的後台 Guard** 看的（讓它略過這些路由），
 * 如果這裡也照做，結果會是「兩個 Guard 都放行」，端點完全沒有認證。
 * 因此規則很簡單：**掛了這個 Guard 就是要認證**，不需要認證的端點不要掛。
 *
 * **掛法**：`@UseGuards()` 在需要認證的 controller 上。目前只有 `front/me`——
 * `/api/front/chat-*` 仍然吃 admin token，切換是 `migrate-chat-to-front-users`
 * 的事，那一步一旦開始就不能留半套狀態。
 */
@Injectable()
export class FrontJwtAuthGuard implements CanActivate {
  constructor(
    @Inject(RESOLVE_USER_CONTEXT_USE_CASE)
    private readonly resolveUserContext: ResolveUserContextUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('缺少授權憑證，請先登入');
    }

    request.frontUser = await this.resolveUserContext.resolve(token);
    return true;
  }

  /**
   * 由 Authorization header 取出 Bearer token
   *
   * **不接受 query string**：query 會出現在伺服器日誌、瀏覽器歷史與 Referer header，
   * 等於把憑證寫進三個不受控的地方。
   */
  private extractToken(request: Request): string | null {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    const token = auth.slice(7).trim();
    return token.length > 0 ? token : null;
  }
}
