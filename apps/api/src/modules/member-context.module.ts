import { Module } from '@nestjs/common';
import { RESOLVE_MEMBER_CONTEXT_USE_CASE } from '@app/application/port/in/shared/ResolveMemberContextUseCase';
import { ResolveMemberContextService } from '@app/application/service/shared/ResolveMemberContextService';
import { JwtModule } from './jwt.module';
import { MemberModule } from './admin/member.module';

/**
 * token → MemberContext 的判定，供所有進入點共用
 *
 * 抽成獨立 module 而非放在 AppModule 的 providers：**NestJS 的 provider 是 module 作用域**，
 * 寫在 AppModule 的 provider 不會對它 import 的 module 可見。要讓 HTTP 的 JwtAuthGuard
 * 與 WebSocket 的 ChatGateway 拿到**同一份**實作，唯一的方式是由一個會 export 它的
 * module 提供，兩邊各自 import。
 *
 * 所需的三個 out port：`TOKEN_BLACKLIST_PORT` 與 `MEMBER_CONTEXT_CACHE_PORT` 由
 * `@Global()` 的 RedisModule 提供，`LOAD_MEMBER_CONTEXT_PORT` 需 import MemberModule。
 */
@Module({
  imports: [JwtModule, MemberModule],
  providers: [
    {
      provide: RESOLVE_MEMBER_CONTEXT_USE_CASE,
      useClass: ResolveMemberContextService,
    },
  ],
  exports: [RESOLVE_MEMBER_CONTEXT_USE_CASE],
})
export class MemberContextModule {}
