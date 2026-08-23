import { Controller, Get, UseGuards } from '@nestjs/common';
import { FrontAuthFacade } from '@app/application/facade/front/FrontAuthFacade';
import type { FrontProfile } from '@app/application/port/in/front/auth/FrontAuthUseCases';
import type { UserContext } from '@app/application/port/user-context';
import { Public } from '../../decorator/public.decorator';
import { CurrentUser } from '../../decorator/current-user.decorator';
import { FrontJwtAuthGuard } from '../../guard/FrontJwtAuthGuard';

/**
 * 前台的個人資料。
 *
 * 獨立成一支 controller 是因為路由前綴不同（`front/me` 而非 `front/auth/me`）——
 * 它回答的是「我是誰」而不是「怎麼登入」。
 *
 * `@Public()` 是給**全域的後台 Guard** 看的（讓它略過），
 * 實際的認證由 `FrontJwtAuthGuard` 執行——後者刻意不檢查 `@Public()`，
 * 否則兩個 Guard 都會放行而這支端點完全沒有認證。
 */
@Controller('front/me')
@Public()
@UseGuards(FrontJwtAuthGuard)
export class FrontMeController {
  constructor(private readonly authFacade: FrontAuthFacade) {}

  @Get()
  me(@CurrentUser() user: UserContext): Promise<FrontProfile> {
    return this.authFacade.getProfile(user.sub);
  }
}
