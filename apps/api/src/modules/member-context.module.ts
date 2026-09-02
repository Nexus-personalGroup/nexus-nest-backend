import { Module } from '@nestjs/common';
import { RESOLVE_MEMBER_CONTEXT_USE_CASE } from '@app/application/port/in/shared/ResolveMemberContextUseCase';
import { ResolveMemberContextService } from '@app/application/service/shared/ResolveMemberContextService';
import { JwtModule } from './jwt.module';
import { MemberPersistenceModule } from './member-persistence.module';

/**
 * token → MemberContext 的判定，供所有進入點共用
 *
 * 抽成獨立 module 而非放在 AppModule 的 providers：**NestJS 的 provider 是 module 作用域**，
 * 寫在 AppModule 的 provider 不會對它 import 的 module 可見。要讓 HTTP 的 JwtAuthGuard
 * 與 WebSocket 的 ChatGateway 拿到**同一份**實作，唯一的方式是由一個會 export 它的
 * module 提供，兩邊各自 import。
 *
 * 所需的三個 out port：`TOKEN_BLACKLIST_PORT` 與 `MEMBER_CONTEXT_CACHE_PORT` 由
 * `@Global()` 的 RedisModule 提供，`LOAD_MEMBER_CONTEXT_PORT` 需 import MemberPersistenceModule。
 *
 * **不要改回 import MemberModule**：本模組被每一個進入點相依（HTTP guard、WS gateway），
 * 指向一個帶著 controller 與業務 service 的模組會讓它從葉節點變成樞紐，
 * 任何一條新的相依都可能繞回來形成循環。指向 `MemberPersistenceModule`
 * 這種葉節點才安全。
 *
 * （這裡原本寫的理由是「MemberModule 相依 ChatWsModule 而後者又 import 本模組」。
 * `improve-startup-signals-and-module-boundaries` 之後那條路徑已不存在——
 * MemberModule 改指向 `SessionRevocationModule`，而 ChatWsModule 也沒有 import 本模組。
 * 規則保留，理由換成上面那個一般性的。）
 */
@Module({
  imports: [JwtModule, MemberPersistenceModule],
  providers: [
    {
      provide: RESOLVE_MEMBER_CONTEXT_USE_CASE,
      useClass: ResolveMemberContextService,
    },
  ],
  exports: [RESOLVE_MEMBER_CONTEXT_USE_CASE],
})
export class MemberContextModule {}
