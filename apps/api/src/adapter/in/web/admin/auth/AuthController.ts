import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { AuthFacade } from '@app/application/facade/admin/AuthFacade';
import { LoginResult } from '@app/application/port/in/admin/auth/LoginUseCase';
import { RefreshTokenResult } from '@app/application/port/in/admin/auth/RefreshTokenUseCase';
import { LoginRequest, loginSchema } from './LoginRequest';
import { LogoutRequest, logoutSchema } from './LogoutRequest';
import {
  ForgotPasswordRequest,
  forgotPasswordSchema,
} from './ForgotPasswordRequest';
import {
  ResetPasswordRequest,
  resetPasswordSchema,
} from './ResetPasswordRequest';
import { RefreshTokenRequest, refreshTokenSchema } from './RefreshTokenRequest';
import { CurrentMember } from '../../decorator/current-member.decorator';
import { MemberContext } from '@app/application/port/member-context';
import { Public } from '../../decorator/public.decorator';
import { ZodValidationPipe } from '@app/infrastructure/zod-validation.pipe';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';

@Controller('admin/auth')
export class AuthController {
  constructor(private readonly authFacade: AuthFacade) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginRequest,
    @Req() req: Request,
  ): Promise<LoginResult> {
    return this.authFacade.login({
      email: dto.email,
      password: dto.password,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      recaptchaToken: dto.recaptchaToken,
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Body(new ZodValidationPipe(refreshTokenSchema)) dto: RefreshTokenRequest,
  ): Promise<RefreshTokenResult> {
    return this.authFacade.refreshToken({
      refreshToken: dto.refreshToken,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Body(new ZodValidationPipe(logoutSchema)) dto: LogoutRequest,
    @CurrentMember() actor: MemberContext,
  ): Promise<void> {
    // 與 JwtAuthGuard.extractToken 一致：確認 Bearer 前綴再取 token
    const auth = req.headers.authorization;
    const accessToken = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
    await this.authFacade.logout({
      accessToken,
      refreshToken: dto.refreshToken,
      email: actor.email,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  // 嚴格節流：防帳號列舉與 SMTP 轟炸（每來源每分鐘 3 次）。
  // 同時壓低「存在 vs 不存在」回應時間差可被利用的次數。
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema))
    dto: ForgotPasswordRequest,
  ): Promise<void> {
    // 不論信箱是否存在皆回 204（防列舉），訊息文案由前端固定呈現
    await this.authFacade.forgotPassword({ email: dto.email });
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema))
    dto: ResetPasswordRequest,
  ): Promise<void> {
    await this.authFacade.resetPassword({
      token: dto.token,
      newPassword: dto.newPassword,
    });
  }
}
