import { Inject, Injectable } from '@nestjs/common';
import {
  LOGIN_USE_CASE,
  LoginCommand,
  LoginResult,
  LoginUseCase,
} from '../../port/in/admin/auth/LoginUseCase';
import {
  LOGOUT_USE_CASE,
  LogoutCommand,
  LogoutUseCase,
} from '../../port/in/admin/auth/LogoutUseCase';
import {
  FORGOT_PASSWORD_USE_CASE,
  ForgotPasswordCommand,
  ForgotPasswordUseCase,
} from '../../port/in/admin/auth/ForgotPasswordUseCase';
import {
  RESET_PASSWORD_USE_CASE,
  ResetPasswordCommand,
  ResetPasswordUseCase,
} from '../../port/in/admin/auth/ResetPasswordUseCase';
import {
  REFRESH_TOKEN_USE_CASE,
  RefreshTokenCommand,
  RefreshTokenResult,
  RefreshTokenUseCase,
} from '../../port/in/admin/auth/RefreshTokenUseCase';

@Injectable()
export class AuthFacade {
  constructor(
    @Inject(LOGIN_USE_CASE)
    private readonly loginUseCase: LoginUseCase,
    @Inject(LOGOUT_USE_CASE)
    private readonly logoutUseCase: LogoutUseCase,
    @Inject(FORGOT_PASSWORD_USE_CASE)
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    @Inject(RESET_PASSWORD_USE_CASE)
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    @Inject(REFRESH_TOKEN_USE_CASE)
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
  ) {}

  login(command: LoginCommand): Promise<LoginResult> {
    return this.loginUseCase.execute(command);
  }

  logout(command: LogoutCommand): Promise<void> {
    return this.logoutUseCase.execute(command);
  }

  forgotPassword(command: ForgotPasswordCommand): Promise<void> {
    return this.forgotPasswordUseCase.execute(command);
  }

  resetPassword(command: ResetPasswordCommand): Promise<void> {
    return this.resetPasswordUseCase.execute(command);
  }

  refreshToken(command: RefreshTokenCommand): Promise<RefreshTokenResult> {
    return this.refreshTokenUseCase.execute(command);
  }
}
