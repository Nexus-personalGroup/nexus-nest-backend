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
}
