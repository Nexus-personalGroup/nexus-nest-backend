import type { MemberContext } from '../adapter/in/web/decorator/current-member.decorator';

// 將 JwtAuthGuard 掛上的 member 透過 global namespace augmentation 擴到 Express Request，
// 各 Guard / Interceptor / Decorator 不需再 `as Request & { member: MemberContext }`
//
// 注意：Express 5 將 Request 宣告於 global Express namespace（非 module），
// 因此使用 `declare global { namespace Express ... }` 而非 `declare module ...`
declare global {
  namespace Express {
    interface Request {
      member?: MemberContext;
    }
  }
}

export {};
