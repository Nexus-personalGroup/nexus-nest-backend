import type { MemberContext } from '../application/port/member-context';
import type { UserContext } from '../application/port/user-context';

// 將 JwtAuthGuard 掛上的 member 透過 global namespace augmentation 擴到 Express Request，
// 各 Guard / Interceptor / Decorator 不需再 `as Request & { member: MemberContext }`
//
// 注意：Express 5 將 Request 宣告於 global Express namespace（非 module），
// 因此使用 `declare global { namespace Express ... }` 而非 `declare module ...`
declare global {
  namespace Express {
    interface Request {
      member?: MemberContext;
      /**
       * 前台使用者的上下文，由 `FrontJwtAuthGuard` 掛上。
       *
       * **與 `member` 是兩個不同的欄位**，不共用一個 `user`：
       * 兩側的形狀不同（前台沒有角色與權限碼），共用會讓每個讀取端
       * 都得先判斷「這是哪一側的」——而漏判的後果是執行期才發現的 undefined。
       */
      frontUser?: UserContext;
    }
  }
}

export {};
