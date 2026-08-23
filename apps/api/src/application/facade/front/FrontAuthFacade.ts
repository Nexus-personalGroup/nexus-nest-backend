import { Inject, Injectable } from '@nestjs/common';
import {
  FRONT_LOGIN_USE_CASE,
  FRONT_LOGOUT_USE_CASE,
  FRONT_REFRESH_TOKEN_USE_CASE,
  GET_FRONT_PROFILE_USE_CASE,
  FrontLoginCommand,
  FrontLoginResult,
  FrontLoginUseCase,
  FrontLogoutUseCase,
  FrontProfile,
  FrontRefreshTokenUseCase,
  GetFrontProfileUseCase,
} from '@app/application/port/in/front/auth/FrontAuthUseCases';

/** 前台認證的入口。controller 只認識這一層，不直接碰 use case */
import {
  FRONT_REGISTER_USE_CASE,
  FrontRegisterCommand,
  FrontRegisterUseCase,
  RESEND_VERIFICATION_USE_CASE,
  ResendVerificationUseCase,
  VERIFY_EMAIL_USE_CASE,
  VerifyEmailResult,
  VerifyEmailUseCase,
} from '@app/application/port/in/front/auth/FrontRegistrationUseCases';
import {
  FRONT_FORGOT_PASSWORD_USE_CASE,
  FrontForgotPasswordUseCase,
  FRONT_RESET_PASSWORD_USE_CASE,
  FrontResetPasswordCommand,
  FrontResetPasswordUseCase,
} from '@app/application/port/in/front/auth/FrontPasswordResetUseCases';
import type { FrontUserSummary } from '@app/application/port/in/front/auth/FrontAuthUseCases';

@Injectable()
export class FrontAuthFacade {
  constructor(
    @Inject(FRONT_LOGIN_USE_CASE)
    private readonly loginUseCase: FrontLoginUseCase,
    @Inject(FRONT_REFRESH_TOKEN_USE_CASE)
    private readonly refreshUseCase: FrontRefreshTokenUseCase,
    @Inject(FRONT_LOGOUT_USE_CASE)
    private readonly logoutUseCase: FrontLogoutUseCase,
    @Inject(GET_FRONT_PROFILE_USE_CASE)
    private readonly profileUseCase: GetFrontProfileUseCase,
    @Inject(FRONT_REGISTER_USE_CASE)
    private readonly registerUseCase: FrontRegisterUseCase,
    @Inject(VERIFY_EMAIL_USE_CASE)
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    @Inject(RESEND_VERIFICATION_USE_CASE)
    private readonly resendUseCase: ResendVerificationUseCase,
    @Inject(FRONT_FORGOT_PASSWORD_USE_CASE)
    private readonly forgotPasswordUseCase: FrontForgotPasswordUseCase,
    @Inject(FRONT_RESET_PASSWORD_USE_CASE)
    private readonly resetPasswordUseCase: FrontResetPasswordUseCase,
  ) {}

  login(command: FrontLoginCommand): Promise<FrontLoginResult> {
    return this.loginUseCase.execute(command);
  }

  refresh(refreshToken: string): Promise<FrontLoginResult> {
    return this.refreshUseCase.execute(refreshToken);
  }

  logout(accessToken: string): Promise<void> {
    return this.logoutUseCase.execute(accessToken);
  }

  getProfile(userId: string): Promise<FrontProfile> {
    return this.profileUseCase.execute(userId);
  }

  register(command: FrontRegisterCommand): Promise<FrontUserSummary> {
    return this.registerUseCase.execute(command);
  }

  verifyEmail(token: string): Promise<VerifyEmailResult> {
    return this.verifyEmailUseCase.execute(token);
  }

  resendVerification(email: string): Promise<void> {
    return this.resendUseCase.execute(email);
  }

  forgotPassword(email: string): Promise<void> {
    return this.forgotPasswordUseCase.execute(email);
  }

  resetPassword(command: FrontResetPasswordCommand): Promise<void> {
    return this.resetPasswordUseCase.execute(command);
  }
}
