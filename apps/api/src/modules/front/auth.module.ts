import { Module } from '@nestjs/common';
import { FrontAuthController } from '../../adapter/in/web/front/auth/FrontAuthController';
import { FrontMeController } from '../../adapter/in/web/front/auth/FrontMeController';
import { FrontAuthFacade } from '../../application/facade/front/FrontAuthFacade';
import { FrontLoginService } from '../../application/service/front/auth/FrontLoginService';
import { FrontLogoutService } from '../../application/service/front/auth/FrontLogoutService';
import { FrontRefreshTokenService } from '../../application/service/front/auth/FrontRefreshTokenService';
import { GetFrontProfileService } from '../../application/service/front/auth/GetFrontProfileService';
import { ResolveUserContextService } from '../../application/service/front/auth/ResolveUserContextService';
import { FrontRegisterService } from '../../application/service/front/auth/FrontRegisterService';
import { VerifyEmailService } from '../../application/service/front/auth/VerifyEmailService';
import { ResendVerificationService } from '../../application/service/front/auth/ResendVerificationService';
import { VerificationMailService } from '../../application/service/front/auth/VerificationMailService';
import { FrontForgotPasswordService } from '../../application/service/front/auth/FrontForgotPasswordService';
import { FrontResetPasswordService } from '../../application/service/front/auth/FrontResetPasswordService';
import { PasswordPolicyService } from '../../application/service/shared/PasswordPolicyService';
import {
  FRONT_LOGIN_USE_CASE,
  FRONT_LOGOUT_USE_CASE,
  FRONT_REFRESH_TOKEN_USE_CASE,
  GET_FRONT_PROFILE_USE_CASE,
  RESOLVE_USER_CONTEXT_USE_CASE,
} from '../../application/port/in/front/auth/FrontAuthUseCases';
import {
  FRONT_REGISTER_USE_CASE,
  RESEND_VERIFICATION_USE_CASE,
  VERIFY_EMAIL_USE_CASE,
} from '../../application/port/in/front/auth/FrontRegistrationUseCases';
import {
  FRONT_FORGOT_PASSWORD_USE_CASE,
  FRONT_RESET_PASSWORD_USE_CASE,
} from '../../application/port/in/front/auth/FrontPasswordResetUseCases';
import { UserPersistenceModule } from '../user-persistence.module';
import { JwtModule } from '../jwt.module';
import { EmailModule } from '../email.module';

/**
 * 前台認證（路由 `/api/front/auth/*` 與 `/api/front/me`）。
 *
 * 與 `admin/auth.module` 是兩套獨立的體系——不同的表、不同的 secret、
 * 不同的上下文型別。共用的只有 `TOKEN_BLACKLIST_PORT`（由 @Global 的 RedisModule 提供），
 * 因為黑名單處理的是 token 這個載體而非背後的身分。
 *
 * `RESOLVE_USER_CONTEXT_USE_CASE` 對外 export：日後聊天的前台端點與 WS
 * 切換到前台帳號時（`migrate-chat-to-front-users`）會需要它。
 */
@Module({
  // EmailModule 提供 SEND_EMAIL_PORT（驗證信與密碼重設信）
  imports: [UserPersistenceModule, JwtModule, EmailModule],
  controllers: [FrontAuthController, FrontMeController],
  providers: [
    FrontLoginService,
    FrontRefreshTokenService,
    FrontLogoutService,
    GetFrontProfileService,
    ResolveUserContextService,
    FrontRegisterService,
    VerifyEmailService,
    ResendVerificationService,
    VerificationMailService,
    FrontForgotPasswordService,
    FrontResetPasswordService,
    PasswordPolicyService,
    { provide: FRONT_LOGIN_USE_CASE, useExisting: FrontLoginService },
    {
      provide: FRONT_REFRESH_TOKEN_USE_CASE,
      useExisting: FrontRefreshTokenService,
    },
    { provide: FRONT_LOGOUT_USE_CASE, useExisting: FrontLogoutService },
    {
      provide: GET_FRONT_PROFILE_USE_CASE,
      useExisting: GetFrontProfileService,
    },
    {
      provide: RESOLVE_USER_CONTEXT_USE_CASE,
      useExisting: ResolveUserContextService,
    },
    { provide: FRONT_REGISTER_USE_CASE, useExisting: FrontRegisterService },
    { provide: VERIFY_EMAIL_USE_CASE, useExisting: VerifyEmailService },
    {
      provide: RESEND_VERIFICATION_USE_CASE,
      useExisting: ResendVerificationService,
    },
    {
      provide: FRONT_FORGOT_PASSWORD_USE_CASE,
      useExisting: FrontForgotPasswordService,
    },
    {
      provide: FRONT_RESET_PASSWORD_USE_CASE,
      useExisting: FrontResetPasswordService,
    },
    FrontAuthFacade,
  ],
  exports: [RESOLVE_USER_CONTEXT_USE_CASE],
})
export class FrontAuthModule {}
