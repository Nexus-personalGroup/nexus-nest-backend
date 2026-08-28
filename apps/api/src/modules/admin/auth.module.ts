import { Module } from '@nestjs/common';
import { AuthController } from '../../adapter/in/web/admin/auth/AuthController';
import { AuthFacade } from '../../application/facade/admin/AuthFacade';
import { LoginService } from '../../application/service/admin/auth/LoginService';
import { LogoutService } from '../../application/service/admin/auth/LogoutService';
import { ForgotPasswordService } from '../../application/service/admin/auth/ForgotPasswordService';
import { ResetPasswordService } from '../../application/service/admin/auth/ResetPasswordService';
import { RefreshTokenService } from '../../application/service/admin/auth/RefreshTokenService';
import { PasswordPolicyService } from '../../application/service/shared/PasswordPolicyService';
import { PrismaPasswordResetTokenRepository } from '../../adapter/out/persistence/auth/PrismaPasswordResetTokenRepository';
import { LOGIN_USE_CASE } from '../../application/port/in/admin/auth/LoginUseCase';
import { LOGOUT_USE_CASE } from '../../application/port/in/admin/auth/LogoutUseCase';
import { FORGOT_PASSWORD_USE_CASE } from '../../application/port/in/admin/auth/ForgotPasswordUseCase';
import { RESET_PASSWORD_USE_CASE } from '../../application/port/in/admin/auth/ResetPasswordUseCase';
import { REFRESH_TOKEN_USE_CASE } from '../../application/port/in/admin/auth/RefreshTokenUseCase';
import { PASSWORD_RESET_TOKEN_PORT } from '../../application/port/out/auth/PasswordResetTokenPort';
import { MemberModule } from './member.module';
import { JwtModule } from '../jwt.module';

@Module({
  imports: [MemberModule, JwtModule],
  controllers: [AuthController],
  providers: [
    // TOKEN_BLACKLIST_PORT + MEMBER_CONTEXT_CACHE_PORT 由 @Global() RedisModule 提供
    // SAVE_AUTH_LOG_PORT 由 @Global() AuthLogModule 提供
    // ACCOUNT_LOCK_PORT + IP_BLOCK_PORT + IP_LIST_PORT 由 @Global() SecurityModule 提供
    // RECAPTCHA_VERIFY_PORT 由 @Global() RecaptchaModule 提供
    // SESSION_ACTIVITY_PORT 由 @Global() RedisModule 提供
    PrismaPasswordResetTokenRepository,
    {
      provide: PASSWORD_RESET_TOKEN_PORT,
      useExisting: PrismaPasswordResetTokenRepository,
    },
    PasswordPolicyService,
    LoginService,
    LogoutService,
    ForgotPasswordService,
    ResetPasswordService,
    RefreshTokenService,
    { provide: LOGIN_USE_CASE, useExisting: LoginService },
    { provide: LOGOUT_USE_CASE, useExisting: LogoutService },
    { provide: FORGOT_PASSWORD_USE_CASE, useExisting: ForgotPasswordService },
    { provide: RESET_PASSWORD_USE_CASE, useExisting: ResetPasswordService },
    { provide: REFRESH_TOKEN_USE_CASE, useExisting: RefreshTokenService },
    AuthFacade,
  ],
})
export class AuthModule {}
