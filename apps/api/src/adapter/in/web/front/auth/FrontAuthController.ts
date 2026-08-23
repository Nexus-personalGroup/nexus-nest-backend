import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FrontAuthFacade } from '@app/application/facade/front/FrontAuthFacade';
import type { FrontLoginResult } from '@app/application/port/in/front/auth/FrontAuthUseCases';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { Public } from '../../decorator/public.decorator';
import {
  frontLoginSchema,
  FrontLoginRequest,
  frontRefreshSchema,
  FrontRefreshRequest,
} from './FrontAuthRequests';

/**
 * 前台認證。
 *
 * **與後台是兩套獨立的體系**：不同的表（`users` vs `members`）、
 * 不同的 secret、不同的上下文型別。共通的只有 token 黑名單——
 * 那是唯一該共用的東西，因為它處理的是 token 這個載體而非背後的身分。
 *
 * `@Public()` 讓全域的 `JwtAuthGuard`（後台的）略過這些路由。
 * 本 controller 的三支端點都自行處理 token，**不掛 `FrontJwtAuthGuard`**：
 * login / refresh 本來就不需要既有的 token，而 logout 必須對客戶端冪等。
 */
@Controller('front/auth')
@Public()
export class FrontAuthController {
  constructor(private readonly authFacade: FrontAuthFacade) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(frontLoginSchema)) dto: FrontLoginRequest,
  ): Promise<FrontLoginResult> {
    return this.authFacade.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(new ZodValidationPipe(frontRefreshSchema)) dto: FrontRefreshRequest,
  ): Promise<FrontLoginResult> {
    return this.authFacade.refresh(dto.refreshToken);
  }

  /**
   * 登出。
   *
   * **刻意不要求先通過認證**：登出對客戶端必須是冪等的——
   * token 已經過期時還要求先驗證才能登出，會讓客戶端陷入「登不出去」的狀態。
   * token 的驗證與黑名單處理在 service 內自行完成，無效的 token 直接視為已登出。
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: Request): Promise<void> {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少授權憑證');
    }
    await this.authFacade.logout(auth.slice(7).trim());
  }
}
