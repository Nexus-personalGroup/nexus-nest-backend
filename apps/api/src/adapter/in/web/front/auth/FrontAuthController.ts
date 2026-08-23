import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Redirect,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { FrontAuthFacade } from '@app/application/facade/front/FrontAuthFacade';
import type { FrontLoginResult } from '@app/application/port/in/front/auth/FrontAuthUseCases';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { Public } from '../../decorator/public.decorator';
import type { FrontUserSummary } from '@app/application/port/in/front/auth/FrontAuthUseCases';
import { getEnv } from '@app/infrastructure/validate-env';
import {
  frontLoginSchema,
  FrontLoginRequest,
  frontRefreshSchema,
  FrontRefreshRequest,
  frontRegisterSchema,
  FrontRegisterRequest,
  frontEmailOnlySchema,
  FrontEmailOnlyRequest,
  verifyEmailQuerySchema,
  VerifyEmailQuery,
  frontResetPasswordSchema,
  FrontResetPasswordRequest,
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

  /**
   * 註冊。
   *
   * **本端點刻意會揭露「這個信箱是否已註冊」（409）**，與底下兩支
   * 「一律成功」的端點不同——不這樣做的話使用者收不到任何有用的回饋，
   * 他會以為註冊成功然後永遠等不到信。要擋的是把它自動化，那是限流的工作。
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(
    @Body(new ZodValidationPipe(frontRegisterSchema)) dto: FrontRegisterRequest,
  ): Promise<FrontUserSummary> {
    return this.authFacade.register(dto);
  }

  /**
   * 信箱驗證。**GET 且帶副作用，這是刻意的**——信件裡只能放連結，而連結只有 GET。
   *
   * 代價是預抓與郵件安全掃描會提前把 token 用掉，因此 service 那一層
   * 讓「成功」是冪等的。失敗一樣導回前台而不是回 JSON：
   * 使用者是從信件點進來的，看到一段 JSON 只會不知道發生什麼事。
   */
  @Get('verify-email')
  // 明寫 302：@Redirect() 自己的預設也是 302，但不寫的話「這支端點回什麼」
  // 只能從裝飾器的預設值推斷，而 swagger 的守則也讀不到它
  @HttpCode(HttpStatus.FOUND)
  @Redirect()
  async verifyEmail(
    @Query(new ZodValidationPipe(verifyEmailQuerySchema))
    query: VerifyEmailQuery,
  ): Promise<{ url: string }> {
    const result = await this.authFacade.verifyEmail(query.token);
    const env = getEnv();
    const base = env.APP_FRONT_URL.replace(/\/$/, '');
    return {
      url: `${base}${env.APP_FRONT_VERIFY_REDIRECT_PATH}?result=${result}`,
    };
  }

  /**
   * 重發驗證信。
   *
   * **無論信箱是否存在、是否已驗證一律 204。** 它若依帳號狀態回不同的東西，
   * 就是一個乾淨的帳號探測點——而重發沒有「給使用者有用回饋」的需求可以拿來抵。
   */
  @Post('resend-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendVerification(
    @Body(new ZodValidationPipe(frontEmailOnlySchema))
    dto: FrontEmailOnlyRequest,
  ): Promise<void> {
    await this.authFacade.resendVerification(dto.email);
  }

  /**
   * 忘記密碼。**無論信箱是否存在一律 204**，判準與重發驗證信相同。
   *
   * **未驗證的帳號也可以用**：忘記密碼與信箱驗證是兩件事，
   * 而重設信本身就會送到那個信箱——能收到就證明他擁有它。
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(
    @Body(new ZodValidationPipe(frontEmailOnlySchema))
    dto: FrontEmailOnlyRequest,
  ): Promise<void> {
    await this.authFacade.forgotPassword(dto.email);
  }

  /**
   * 重設密碼。
   *
   * 成功會**遞增 `tokenVersion`**讓所有裝置立即登出——會走到這條路徑的情境
   * 本來就包含「帳號可能正被別人用著」，改完密碼卻讓對方的 session 繼續有效
   * 等於只重設了一半。
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body(new ZodValidationPipe(frontResetPasswordSchema))
    dto: FrontResetPasswordRequest,
  ): Promise<void> {
    await this.authFacade.resetPassword(dto);
  }
}
